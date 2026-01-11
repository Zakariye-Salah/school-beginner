// main.js (modified: add id hide/show, screenshot button, inline totals & compact header)
import { db } from './firebase-config.js';
import { doc, getDoc, getDocs, collection, query, where } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';

const searchBtn = document.getElementById('searchBtn');
const studentIdInput = document.getElementById('studentId');
const resultArea = document.getElementById('resultArea');
const message = document.getElementById('message');

const loaderOverlay = document.getElementById('loaderOverlay');
const loaderMessageEl = document.getElementById('loaderMessage');
const toggleIdInputBtn = document.getElementById('toggleIdInputBtn');

const publishedListState = {}; // state store

/* loader logic (unchanged) */
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

/* helpers (unchanged) */
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

/* ---------- renderResult (updated header, inline totals, mask & screenshot) ---------- */
async function renderResult(doc, opts = {}) {
  resultArea.style.display = 'block';
  resultArea.innerHTML = '';

  const published = doc.publishedAt ? new Date(doc.publishedAt.seconds ? doc.publishedAt.seconds*1000 : doc.publishedAt).toLocaleString() : '';
  const examName = doc.examName || doc.examId || '';

  // detect components (same as before)
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

  // build compact header (name + id side-by-side)
  const motherLine = doc.motherName ? `<div style="margin-top:4px;font-size:0.92rem"><strong>Ina Hooyo:</strong> ${escape(doc.motherName)}</div>` : '';
  const examLabel = examName || 'Exam';

  // generate table HTML exactly like before (unchanged)
  const hasLinked = Boolean(doc.linkedExamName) || Boolean(doc.linkedExamId) || (Array.isArray(doc.subjects) && doc.subjects.some(s => s.components && s.components.linked));
  let tableHtml = `<div style="overflow:auto;margin-top:8px"><table style="width:100%;border-collapse:collapse;font-family:inherit">`;
  tableHtml += `<thead><tr style="background:#f8fafc"><th style="text-align:left;padding:8px 10px">Subject</th>`;
  if(hasLinked) tableHtml += `<th style="text-align:center;padding:8px 10px">${escape(doc.linkedExamName || doc.linkedExamId || 'Prev')}</th>`;
  if(compsEnabled.assignment) tableHtml += `<th style="text-align:center;padding:8px 10px">Assignment</th>`;
  if(compsEnabled.quiz) tableHtml += `<th style="text-align:center;padding:8px 10px">Quiz</th>`;
  if(compsEnabled.monthly) tableHtml += `<th style="text-align:center;padding:8px 10px">Monthly</th>`;
  if(compsEnabled.exam) tableHtml += `<th style="text-align:center;padding:8px 10px">${escape(examLabel)}</th>`;
  tableHtml += `<th style="text-align:center;padding:8px 10px">Total</th><th style="text-align:center;padding:8px 10px">Max</th></tr></thead><tbody>`;

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

      tableHtml += `<tr style="border-bottom:1px solid #eef2f7"><td style="padding:8px 10px">${escape(s.name)}</td>`;
      if(hasLinked){
        const prevVal = (s.components && s.components.linked && (typeof s.components.linked.total !== 'undefined')) ? s.components.linked.total : (s.components && typeof s.components.linked === 'number' ? s.components.linked : '-');
        tableHtml += `<td style="text-align:center;padding:8px 10px">${escape(String(prevVal != null ? prevVal : '-'))}</td>`;
      }
      if(compsEnabled.assignment) tableHtml += `<td style="text-align:center;padding:8px 10px">${escape(String((comps.assignment != null) ? comps.assignment : (s.assignment != null ? s.assignment : '-')))}</td>`;
      if(compsEnabled.quiz)       tableHtml += `<td style="text-align:center;padding:8px 10px">${escape(String((comps.quiz != null) ? comps.quiz : (s.quiz != null ? s.quiz : '-')))}</td>`;
      if(compsEnabled.monthly)    tableHtml += `<td style="text-align:center;padding:8px 10px">${escape(String((comps.monthly != null) ? comps.monthly : (s.monthly != null ? s.monthly : '-')))}</td>`;
      if(compsEnabled.exam)       tableHtml += `<td style="text-align:center;padding:8px 10px">${escape(String((comps.exam != null) ? comps.exam : (s.exam != null ? s.exam : '-')))}</td>`;
      tableHtml += `<td style="text-align:center;padding:8px 10px">${escape(String(rowTotal))}</td><td style="text-align:center;padding:8px 10px">${escape(String(rowMax||''))}</td></tr>`;

      totGot += Number(rowTotal||0); totMax += Number(rowMax||0);
    }
  }
  tableHtml += `</tbody></table></div>`;

  // totals calculation (same)
  const total = typeof doc.total !== 'undefined' ? Number(doc.total) : totGot;
  const averageRaw = typeof doc.average !== 'undefined' ? Number(doc.average) : ( (doc.subjects && doc.subjects.length) ? (total / doc.subjects.length) : 0 );
  const sumMax = totMax;
  const percent = sumMax ? (total / sumMax * 100) : 0;
  const grade = gradeForPercent(percent);
  const passfail = percent >= 50 ? 'Gudbay' : 'Dhacay';
  const percentCol = percentColor(percent);
  const gradeBg = gradeColor(grade);

  // inline totals: single-line items
  const totalsHtml = `<div id="totalsInline" class="tiny">
      <span class="tot-item">Total: <strong style="color:#2459ff">${escape(String(total))}</strong> / <span style="color:green">${escape(String(sumMax))}</span></span>
      <span class="tot-item">Percent: <strong style="color:${percentCol}">${percent.toFixed(2)}%</strong></span>
      <span class="tot-item">Average: <strong>${Number(averageRaw).toFixed(2)}</strong></span>
      <span class="tot-item">Grade: <span id="gradeBadge" style="background:${gradeBg}">${grade}</span></span>
      <span class="tot-item">Status: <strong style="color:${percent>=50 ? '#0b8a3e' : '#c0392b'}">${escape(passfail)}</strong></span>
      <span class="tot-item">School rank: <strong id="schoolRankCell">${escape(String(doc.schoolRank || '/—'))}</strong></span>
      <span class="tot-item">Class rank: <strong id="classRankCell">${escape(String(doc.classRank || '/—'))}</strong></span>
    </div>`;

  // actions (PDF + more + screenshot)
  const actionsHtml = `<div class="result-actions">
      <button id="printBtn" class="btn btn-primary"><svg class="icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 9H18V4H6V9Z" stroke="#fff" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>Daabac (PDF)</button>
      <button id="${`moreExamsBtn_${escape(String(doc.studentId))}`}" class="btn btn-ghost">More published exams</button>
      <button id="screenshotBtn" class="btn"><svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 7A5 5 0 1 0 12 17A5 5 0 0 0 12 7Z" stroke="currentColor" stroke-width="1.2" fill="none"></path><path d="M3 3H7L8 6H16L17 3H21" stroke="currentColor" stroke-width="1.2" fill="none"></path></svg>Screenshot</button>
    </div>`;

  // header: name + id + exam + published + source (name slanted)
  const headerHtml = `<div class="card" style="padding:12px 14px">
    <div class="result-header">
      <div class="student-name slanted" id="studentNameText">${escape(doc.studentName || 'Magac aan la garanayn')}</div>
      <div class="student-meta" style="gap:6px">
        <div>ID: <span id="studentIdText" style="font-weight:700">${escape(doc.studentId)}</span></div>
        <button id="maskIdBtn" class="btn" style="padding:4px 8px;font-size:0.85rem">👁‍🗨</button>
        <div>Class: <strong>${escape(doc.className || doc.classId || '')}</strong></div>
        <div style="color:#6b7280">Exam: <strong>${escape(examLabel)}</strong></div>
      </div>
    </div>
    ${motherLine}
    <div style="margin-top:6px;color:#9ca3af;font-size:0.85rem">Published: ${escape(published)} &nbsp; Source: ${escape(opts.source || '')}</div>
  </div>`;

  // now compose the big HTML
  resultArea.innerHTML = headerHtml + tableHtml + totalsHtml + actionsHtml;

  // hide loader
  hideLoader();

  // --- ID mask toggle (for the displayed ID) ---
  const maskBtn = document.getElementById('maskIdBtn');
  const idTextEl = document.getElementById('studentIdText');
  let idMasked = true; // default masked to protect id by default
  const originalId = idTextEl ? idTextEl.textContent : '';
  function renderIdMask() {
    if(!idTextEl) return;
    if(idMasked){
      // show partial mask: keep last 3 chars if available
      const s = originalId || '';
      if(s.length <= 3) idTextEl.textContent = '*'.repeat(s.length);
      else idTextEl.textContent = '*'.repeat(Math.max(0, s.length - 3)) + s.slice(-3);
      maskBtn.textContent = '👁'; // show-eye icon meaning "show"
    } else {
      idTextEl.textContent = originalId;
      maskBtn.textContent = '🙈'; // hide-eye icon meaning "hide"
    }
  }
  if(maskBtn){
    maskBtn.onclick = () => { idMasked = !idMasked; renderIdMask(); };
    renderIdMask();
  }

  // Also add a toggle for the small "input" hide/show (the earlier toggle button by the input)
  if(toggleIdInputBtn){
    // initial: visible (text). clicking toggles type "password"/"text" on the input element
    let inputHidden = false;
    toggleIdInputBtn.onclick = () => {
      inputHidden = !inputHidden;
      studentIdInput.type = inputHidden ? 'password' : 'text';
      toggleIdInputBtn.textContent = inputHidden ? '👁‍🗨' : '🔓';
    };
  }

  // --- screenshot button: capture the card area (student name + results) ---
  const screenshotBtn = document.getElementById('screenshotBtn');
  if(screenshotBtn){
    screenshotBtn.onclick = async () => {
      // capture only the first result-card(s) area: header + table + totals
      // create a temporary wrapper so we capture only what we want
      const captureEl = resultArea; // resultArea contains header + table + totals
      try {
        // use html2canvas (loaded via CDN)
        const canvas = await window.html2canvas(captureEl, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
        const dataUrl = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = dataUrl;
        const safeName = (doc.studentName || doc.studentId || 'result').replace(/\s+/g,'_');
        a.download = `${safeName}_result.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } catch(e){
        console.error('Screenshot failed', e);
        alert('Screenshot failed — isku day mar kale.');
      }
    };
  }

  // --- PDF button (kept your existing logic mostly) ---
  document.getElementById('printBtn').onclick = async () => {
    try {
      if(!(window.jspdf && window.jspdf.jsPDF)) throw new Error('jsPDF not available');
      const { jsPDF } = window.jspdf;
      const docPdf = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });
      const margin = 20;
      let cursorY = margin;
      docPdf.setFontSize(12);
      docPdf.text(`${doc.studentName || ''}`, margin, cursorY);
      docPdf.setFontSize(9);
      if(doc.motherName) docPdf.text(`Ina Hooyo: ${doc.motherName}`, margin, cursorY + 16);
      docPdf.text(`ID: ${doc.studentId}  |  Class: ${doc.className || doc.classId || ''}`, margin, cursorY + 32);
      docPdf.text(`Exam: ${examLabel} ${doc.examId ? `(${doc.examId})` : ''}`, margin, cursorY + 48);
      docPdf.text(`Published: ${published}`, margin, cursorY + 64);
      docPdf.text(`Source: ${opts.source || ''}`, margin, cursorY + 80);
      cursorY += 96;

      // columns + table creation (same as before)
      const subjectCols = [];
      subjectCols.push({ header: 'Subject', dataKey: 'subject' });
      if(hasLinked) subjectCols.push({ header: (doc.linkedExamName || 'Prev'), dataKey: 'linked' });
      if(compsEnabled.assignment) subjectCols.push({ header: 'Assignment', dataKey: 'assignment' });
      if(compsEnabled.quiz) subjectCols.push({ header: 'Quiz', dataKey: 'quiz' });
      if(compsEnabled.monthly) subjectCols.push({ header: 'Monthly', dataKey: 'monthly' });
      if(compsEnabled.exam) subjectCols.push({ header: examLabel, dataKey: 'exam' });
      subjectCols.push({ header: 'Total', dataKey: 'total' });
      subjectCols.push({ header: 'Max', dataKey: 'max' });

      const tableData = (doc.subjects||[]).map(s => {
        const comps = s.components || {};
        const obj = { subject: s.name };
        if(hasLinked) obj.linked = (s.components && s.components.linked && typeof s.components.linked.total !== 'undefined') ? String(s.components.linked.total) : ((typeof s.components?.linked === 'number') ? String(s.components.linked) : '-');
        if(compsEnabled.assignment) obj.assignment = (comps.assignment != null) ? String(comps.assignment) : (s.assignment != null ? String(s.assignment) : '-');
        if(compsEnabled.quiz) obj.quiz = (comps.quiz != null) ? String(comps.quiz) : (s.quiz != null ? String(s.quiz) : '-');
        if(compsEnabled.monthly) obj.monthly = (comps.monthly != null) ? String(comps.monthly) : (s.monthly != null ? String(s.monthly) : '-');
        if(compsEnabled.exam) obj.exam = (comps.exam != null) ? String(comps.exam) : (s.exam != null ? String(s.exam) : '-');
        obj.total = (typeof s.mark !== 'undefined') ? String(s.mark) : String(s.total != null ? s.total : ((comps.assignment||0)+(comps.quiz||0)+(comps.monthly||0)+(comps.exam||0)));
        obj.max = String(s.max || '');
        return obj;
      });

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
      docPdf.setFillColor( parseInt(gradeBg.slice(1,3),16), parseInt(gradeBg.slice(3,5),16), parseInt(gradeBg.slice(5,7),16) );
      docPdf.rect(margin + 420, footY - 8, 36, 16, 'F');
      docPdf.setTextColor(255,255,255);
      docPdf.text(`${grade}`, margin + 428, footY + 4);
      docPdf.setTextColor(0,0,0);

      // ranks append (attempt)
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
        } catch(e){ /* ignore */ }
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

  // wire "More published exams" toggle (keeps original behavior)
  const moreBtn = document.getElementById(`moreExamsBtn_${CSS.escape(String(doc.studentId))}`);
  if(moreBtn) moreBtn.onclick = () => togglePublishedList(doc.studentId);

  // update school/class ranks asynchronously (original logic preserved)
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
          if(doc.schoolRank && schoolSize) schoolRankCell.textContent = `${escape(String(doc.schoolRank))} / ${escape(String(schoolSize))}`;
          else if(doc.schoolRank) schoolRankCell.textContent = `${escape(String(doc.schoolRank))}`;
        }
        if(classRankCell){
          if(doc.classRank && classSize) classRankCell.textContent = `${escape(String(doc.classRank))} / ${escape(String(classSize))}`;
          else if(doc.classRank) classRankCell.textContent = `${escape(String(doc.classRank))}`;
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

export { renderResult }; // export for clarity if needed (optional)
