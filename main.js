// main.js (UPDATED: adds loader overlay, rotating messages, responsive PDF tweaks)
// Keep your original imports
import { db } from './firebase-config.js';
import { doc, getDoc, getDocs, collection, query, where } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';

const searchBtn = document.getElementById('searchBtn');
const studentIdInput = document.getElementById('studentId');
const resultArea = document.getElementById('resultArea');
const message = document.getElementById('message');

const loaderOverlay = document.getElementById('loaderOverlay');
const loaderMessageEl = document.getElementById('loaderMessage');

const publishedListState = {}; // studentId -> { visible: bool, container: DOMElement, selectedExamId: string }

/* ----- LOADER helpers ----- */
let loaderInterval = null;
const loaderMessages = [
  'Fadlan sug...',
  'Waxaan hubineynaa xogta...',
  'Waxaa la soo rarayaa natiijooyinka...',
  'Ku dhowaaneysa—fadlan sug...',
  'Fadlan sii sug, waxaan raadineynaa faylasha...'
];

function showLoader() {
  if(!loaderOverlay) return;
  loaderOverlay.style.display = 'flex';
  loaderOverlay.setAttribute('aria-hidden','false');
  // start message cycle
  let idx = 0;
  loaderMessageEl.textContent = loaderMessages[0];
  if(loaderInterval) clearInterval(loaderInterval);
  loaderInterval = setInterval(()=> {
    idx = (idx + 1) % loaderMessages.length;
    loaderMessageEl.textContent = loaderMessages[idx];
  }, 2200);
}

function hideLoader() {
  if(!loaderOverlay) return;
  loaderOverlay.style.display = 'none';
  loaderOverlay.setAttribute('aria-hidden','true');
  if(loaderInterval) { clearInterval(loaderInterval); loaderInterval = null; }
  loaderMessageEl.textContent = '';
}

/* ---------- rest of your helpers & functions (unchanged except small PDF tweaks) ---------- */

function rankColor(rank){
  if(rank === 1) return '#FFD700';
  if(rank === 2) return '#C0C0C0';
  if(rank === 3) return '#CD7F32';
  return '#111827';
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

function gradeColor(grade){
  // returns background color for grade badge - keep same
  if(grade === 'A+' ) return '#0b8a3e';
  if(grade === 'A' ) return '#26a64b';
  if(grade === 'A-' ) return '#66d17a';
  if(grade.startsWith('B')) return '#3b82f6';
  if(grade.startsWith('C')) return '#f59e0b';
  if(grade.startsWith('D')) return '#f97316';
  if(grade.startsWith('E')) return '#ef4444';
  return '#b91c1c';
}

function escape(s){ if(s==null) return ''; return String(s).replace(/[&<>"']/g, (c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[c])); }

/* ---------- render result (improved) ---------- */
async function renderResult(doc, opts = {}) {
  resultArea.style.display = 'block';
  resultArea.innerHTML = '';
  const published = doc.publishedAt ? new Date(doc.publishedAt.seconds ? doc.publishedAt.seconds*1000 : doc.publishedAt).toLocaleString() : '';
  const examName = doc.examName || doc.examId || '';

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

  const motherLine = doc.motherName ? `<div style="margin-top:6px"><strong>Ina Hooyo:</strong> ${escape(doc.motherName)}</div>` : '';

  let linkedLabel = doc.linkedExamName || (doc.linkedExamId ? 'Prev' : null);
  const examLabel = examName || 'Exam';

  const moreBtnId = `moreExamsBtn_${escape(String(doc.studentId))}`;
  let html = `<div class="card result-card" style="padding:16px;border-radius:10px;box-shadow:0 6px 18px rgba(15,23,42,0.06);">
    <h2 style="margin:0 0 8px 0;font-size:1.4rem;color:#0f172a">${escape(doc.studentName || 'Magac aan la garanayn')}</h2>
    ${motherLine}
    <div style="color:#6b7280;margin-top:6px;font-size:0.95rem">ID: <strong>${escape(doc.studentId)}</strong> | Class: <strong>${escape(doc.className || doc.classId || '')}</strong></div>
    <div style="margin-top:8px;color:#374151;font-size:0.95rem"><strong>Exam:</strong> ${escape(examLabel)} ${doc.examId?`(<small style="color:#6b7280">${escape(doc.examId)}</small>)`:''}</div>
    <div style="margin-top:4px;color:#9ca3af;font-size:0.85rem">Published: ${escape(published)}</div>`;

  if(opts.source) html += `<div style="margin-top:6px;color:#6b7280;font-size:0.85rem">Source: ${escape(opts.source)}</div>`;

  // table header
  html += `<div style="overflow:auto;margin-top:12px"><table style="width:100%;border-collapse:collapse;font-family:inherit"><thead><tr style="background:#f8fafc"><th style="text-align:left;padding:8px 10px">Subject</th>`;
  const hasLinked = Boolean(doc.linkedExamName) || Boolean(doc.linkedExamId) || (Array.isArray(doc.subjects) && doc.subjects.some(s => s.components && s.components.linked));
  if(hasLinked) html += `<th id="linkedHeader" style="text-align:center;padding:8px 10px">${escape(linkedLabel || 'Prev')}</th>`;
  if(compsEnabled.assignment) html += `<th style="text-align:center;padding:8px 10px">Assignment</th>`;
  if(compsEnabled.quiz) html += `<th style="text-align:center;padding:8px 10px">Quiz</th>`;
  if(compsEnabled.monthly) html += `<th style="text-align:center;padding:8px 10px">Monthly</th>`;
  if(compsEnabled.exam) html += `<th style="text-align:center;padding:8px 10px">${escape(examLabel)}</th>`;
  html += `<th style="text-align:center;padding:8px 10px">Total</th><th style="text-align:center;padding:8px 10px">Max</th></tr></thead><tbody>`;

  // rows
  let totGot = 0, totMax = 0;
  if(doc.subjects && Array.isArray(doc.subjects)){
    for(const s of doc.subjects){
      const comps = s.components || {};
      const combinedMark = typeof s.mark !== 'undefined' ? Number(s.mark) : (Number(s.total || 0));
      let componentSum = 0;
      if(typeof s.mark === 'undefined'){
        if(comps.assignment != null) componentSum += Number(comps.assignment);
        else if(s.assignment != null) componentSum += Number(s.assignment);
        if(comps.quiz != null) componentSum += Number(comps.quiz);
        else if(s.quiz != null) componentSum += Number(s.quiz);
        if(comps.monthly != null) componentSum += Number(comps.monthly);
        else if(s.monthly != null) componentSum += Number(s.monthly);
        if(comps.exam != null) componentSum += Number(comps.exam);
        else if(s.exam != null) componentSum += Number(s.exam);
      }

      const rowTotal = (typeof s.mark !== 'undefined') ? combinedMark : componentSum;
      const rowMax = Number(s.max || 0);

      html += `<tr style="border-bottom:1px solid #eef2f7"><td style="padding:8px 10px">${escape(s.name)}</td>`;
      if(hasLinked){
        const prevVal = (s.components && s.components.linked && (typeof s.components.linked.total !== 'undefined')) ? s.components.linked.total : (s.components && typeof s.components.linked === 'number' ? s.components.linked : '-');
        html += `<td style="text-align:center;padding:8px 10px">${escape(String(prevVal != null ? prevVal : '-'))}</td>`;
      }

      if(compsEnabled.assignment) html += `<td style="text-align:center;padding:8px 10px">${escape(String((comps.assignment != null) ? comps.assignment : (s.assignment != null ? s.assignment : '-')))}</td>`;
      if(compsEnabled.quiz)       html += `<td style="text-align:center;padding:8px 10px">${escape(String((comps.quiz != null) ? comps.quiz : (s.quiz != null ? s.quiz : '-')))}</td>`;
      if(compsEnabled.monthly)    html += `<td style="text-align:center;padding:8px 10px">${escape(String((comps.monthly != null) ? comps.monthly : (s.monthly != null ? s.monthly : '-')))}</td>`;
      if(compsEnabled.exam)       html += `<td style="text-align:center;padding:8px 10px">${escape(String((comps.exam != null) ? comps.exam : (s.exam != null ? s.exam : '-')))}</td>`;

      html += `<td style="text-align:center;padding:8px 10px">${escape(String(rowTotal))}</td><td style="text-align:center;padding:8px 10px">${escape(String(rowMax||''))}</td></tr>`;

      totGot += Number(rowTotal||0); totMax += Number(rowMax||0);
    }
  }

  html += `</tbody></table></div>`;

  // totals block
  const total = typeof doc.total !== 'undefined' ? Number(doc.total) : totGot;
  const averageRaw = typeof doc.average !== 'undefined' ? Number(doc.average) : ( (doc.subjects && doc.subjects.length) ? (total / doc.subjects.length) : 0 );
  const sumMax = totMax;

  const percent = sumMax ? (total / sumMax * 100) : 0;
  const grade = gradeForPercent(percent);
  const passfail = percent >= 50 ? 'Gudbay' : 'Dhacay';
  const percentCol = percentColor(percent);
  const gradeBg = gradeColor(grade);

  const schoolRankText = doc.schoolRank ? `${escape(String(doc.schoolRank))}` : '/—';
  const classRankText = doc.classRank ? `${escape(String(doc.classRank))}` : '/—';

  html += `<div id="totalsBlock" style="margin-top:12px;display:flex;align-items:center;gap:18px;flex-wrap:wrap">
    <div><strong>Total:</strong> <span style="color:blue;font-weight:700">${escape(String(total))}</span> / <span style="color:green">${escape(String(sumMax))}</span></div>
    <div><strong>Percent:</strong> <span style="color:${percentCol};font-weight:700">${percent.toFixed(2)}%</span></div>
    <div><strong>Average:</strong> <span style="color:${percentColor(averageRaw)};font-weight:700">${Number(averageRaw).toFixed(2)}</span></div>
    <div><strong>Grade:</strong> <span id="gradeBadge" style="background:${gradeBg};color:#fff;padding:6px 10px;border-radius:8px;font-weight:800">${grade}</span></div>
    <div><strong>Status:</strong> <span style="color:${percent>=50 ? '#0b8a3e' : '#c0392b'}; font-weight:700">${escape(passfail)}</span></div>
  </div>`;

  html += `<div id="ranksBlock" style="margin-top:10px;font-weight:600">
    <span id="schoolRankCell" style="${doc.schoolRank ? `color:${rankColor(doc.schoolRank)};font-weight:700` : ''}">School rank: ${schoolRankText}</span>
    &nbsp;&nbsp;
    <span id="classRankCell" style="font-weight:600">Class rank: ${classRankText}</span>
  </div>`;

  html += `<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
    <button id="printBtn" class="btn btn-primary" style="padding:8px 12px;border-radius:8px">Daabac (PDF)</button>
    <button id="${moreBtnId}" class="btn btn-ghost" style="padding:8px 12px;border-radius:8px">More published exams</button>
  </div>`;

  html += `</div>`; // close card

  resultArea.innerHTML = html;

  // hide loader if present
  hideLoader();

  // wire print -> PDF generation (tighter margins & smaller fonts to fit)
  document.getElementById('printBtn').onclick = async () => {
    try {
      if(!(window.jspdf && window.jspdf.jsPDF)) throw new Error('jsPDF not available');
      const { jsPDF } = window.jspdf;
      // use landscape only if many columns; else portrait - pick portrait for better readability on mobile
      const docPdf = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });
      const margin = 20; // smaller margins to pack content
      let cursorY = margin;

      // header (smaller font sizes)
      docPdf.setFontSize(12);
      docPdf.text(`${doc.studentName || ''}`, margin, cursorY);
      docPdf.setFontSize(9);
      if(doc.motherName) docPdf.text(`Ina Hooyo: ${doc.motherName}`, margin, cursorY + 16);
      docPdf.text(`ID: ${doc.studentId}  |  Class: ${doc.className || doc.classId || ''}`, margin, cursorY + 32);
      docPdf.text(`Exam: ${examLabel} ${doc.examId ? `(${doc.examId})` : ''}`, margin, cursorY + 48);
      docPdf.text(`Published: ${published}`, margin, cursorY + 64);
      docPdf.text(`Source: ${opts.source || ''}`, margin, cursorY + 80);
      cursorY += 96;

      // build columns for autotable
      const subjectCols = [];
      subjectCols.push({ header: 'Subject', dataKey: 'subject' });
      const hasLinkedCol = hasLinked;
      if(hasLinkedCol) subjectCols.push({ header: (doc.linkedExamName || linkedLabel || 'Prev'), dataKey: 'linked' });
      if(compsEnabled.assignment) subjectCols.push({ header: 'Assignment', dataKey: 'assignment' });
      if(compsEnabled.quiz) subjectCols.push({ header: 'Quiz', dataKey: 'quiz' });
      if(compsEnabled.monthly) subjectCols.push({ header: 'Monthly', dataKey: 'monthly' });
      if(compsEnabled.exam) subjectCols.push({ header: examLabel, dataKey: 'exam' });
      subjectCols.push({ header: 'Total', dataKey: 'total' });
      subjectCols.push({ header: 'Max', dataKey: 'max' });

      const tableData = (doc.subjects||[]).map(s => {
        const comps = s.components || {};
        const obj = { subject: s.name };
        if(hasLinkedCol) obj.linked = (s.components && s.components.linked && typeof s.components.linked.total !== 'undefined') ? String(s.components.linked.total) : ((typeof s.components?.linked === 'number') ? String(s.components.linked) : '-');
        if(compsEnabled.assignment) obj.assignment = (comps.assignment != null) ? String(comps.assignment) : (s.assignment != null ? String(s.assignment) : '-');
        if(compsEnabled.quiz) obj.quiz = (comps.quiz != null) ? String(comps.quiz) : (s.quiz != null ? String(s.quiz) : '-');
        if(compsEnabled.monthly) obj.monthly = (comps.monthly != null) ? String(comps.monthly) : (s.monthly != null ? String(s.monthly) : '-');
        if(compsEnabled.exam) obj.exam = (comps.exam != null) ? String(comps.exam) : (s.exam != null ? String(s.exam) : '-');
        obj.total = (typeof s.mark !== 'undefined') ? String(s.mark) : String(s.total != null ? s.total : ((comps.assignment||0)+(comps.quiz||0)+(comps.monthly||0)+(comps.exam||0)));
        obj.max = String(s.max || '');
        return obj;
      });

      // autotable with small font and compact cell padding
      docPdf.autoTable({
        startY: cursorY,
        head: [subjectCols.map(c => c.header)],
        body: tableData.map(row => subjectCols.map(c => row[c.dataKey] || '')),
        styles: { fontSize: 8, cellPadding: 4 },
        headStyles: { fillColor: [240,240,240], textColor: [20,20,20], fontStyle: 'bold' },
        margin: { left: margin, right: margin },
        tableWidth: 'auto'
      });

      const footY = docPdf.lastAutoTable ? docPdf.lastAutoTable.finalY + 12 : docPdf.internal.pageSize.getHeight() - 80;
      docPdf.setFontSize(9);
      docPdf.text(`Total: ${total} / ${sumMax}`, margin, footY);
      docPdf.text(`Percent: ${percent.toFixed(2)}%`, margin + 200, footY);
      docPdf.text(`Average: ${Number(averageRaw).toFixed(2)}`, margin + 320, footY);

      // grade box small
      docPdf.setFillColor( parseInt(gradeBg.slice(1,3),16), parseInt(gradeBg.slice(3,5),16), parseInt(gradeBg.slice(5,7),16) );
      docPdf.rect(margin + 420, footY - 8, 36, 16, 'F');
      docPdf.setTextColor(255,255,255);
      docPdf.text(`${grade}`, margin + 428, footY + 4);
      docPdf.setTextColor(0,0,0);

      // ranks counts: attempt to fetch counts and append to PDF (try/catch)
      if(doc.examId){
        try {
          const qAll = query(collection(db,'examTotals'), where('examId','==', doc.examId));
          const snapAll = await getDocs(qAll);
          const schoolSize = snapAll.size || 0;

          let classSize = 0;
          if(doc.classId){
            snapAll.forEach(d => {
              const data = d.data();
              if(data.classId === doc.classId) classSize++;
            });
          }

          docPdf.text(`School rank: ${doc.schoolRank ? doc.schoolRank + ' / ' + schoolSize : '/—'}`, margin, footY + 24);
          docPdf.text(`Class rank: ${doc.classRank ? doc.classRank + ' / ' + classSize : '/—'}`, margin + 200, footY + 24);
        } catch(e){
          // ignore
        }
      }

      const fname = `${(doc.studentName || doc.studentId || 'result').replace(/\s+/g,'_')}_${(doc.examName || 'exam').replace(/\s+/g,'_')}.pdf`;
      docPdf.save(fname);
      return;
    } catch(e){
      console.warn('PDF generation failed or jsPDF not present, falling back to print:', e);
      window.print();
      return;
    }
  };

  // wire "More published exams" toggle
  const moreBtn = document.getElementById(moreBtnId);
  moreBtn.onclick = () => togglePublishedList(doc.studentId);

  // If doc contains linkedExamId but not linkedExamName, try to fetch exam doc name and update header label
  if(!doc.linkedExamName && doc.linkedExamId){
    (async ()=>{
      try {
        const exSnap = await getDoc(doc(db,'exams', doc.linkedExamId));
        if(exSnap.exists()){
          const name = exSnap.data().name || null;
          const el = document.getElementById('linkedHeader');
          if(el && name) el.textContent = name;
        }
      } catch(e){ /* ignore */ }
    })();
  }

  // update school/class rank counts on the page (async)
  if(doc.examId){
    (async ()=>{
      try {
        const qAll = query(collection(db,'examTotals'), where('examId','==', doc.examId));
        const snapAll = await getDocs(qAll);
        const schoolSize = snapAll.size || 0;

        let classSize = 0;
        if(doc.classId){
          snapAll.forEach(d => {
            const data = d.data();
            if(data.classId === doc.classId) classSize++;
          });
        }

        const schoolRankCell = document.getElementById('schoolRankCell');
        const classRankCell = document.getElementById('classRankCell');
        if(schoolRankCell){
          if(doc.schoolRank && schoolSize) schoolRankCell.textContent = `School rank: ${escape(String(doc.schoolRank))} / ${escape(String(schoolSize))}`;
          else if(doc.schoolRank) schoolRankCell.textContent = `School rank: ${escape(String(doc.schoolRank))}`;
        }
        if(classRankCell){
          if(doc.classRank && classSize) classRankCell.textContent = `Class rank: ${escape(String(doc.classRank))} / ${escape(String(classSize))}`;
          else if(doc.classRank) classRankCell.textContent = `Class rank: ${escape(String(doc.classRank))}`;
        }
      } catch(e){
        console.warn('Rank count fetch failed', e);
      }
    })();
  }
}

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
