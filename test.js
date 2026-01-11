/* -------------------------
   New list + view UI logic
   Paste into database.js
   Replace old renderStudents/renderTeachers/renderClasses/renderSubjects
---------------------------*/

/** helper: count students assigned to a class (by class.name) */
function countStudentsInClass(className){
  if(!className) return 0;
  return (studentsCache || []).filter(s => (s.classId || '') === className).length;
}

/** ---------- TEACHERS (table view + View modal) ---------- */
function renderTeachers(){
  if(!teachersList) return;
  // summary + table
  const total = (teachersCache || []).length;
  let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <strong>Total teachers: ${total}</strong>
      <div class="muted">Showing ID, Name, Salary — click View for more</div>
    </div>`;
  html += `<div style="overflow:auto"><table style="width:100%;border-collapse:collapse">
    <thead>
      <tr style="text-align:left;border-bottom:1px solid #e6eef8">
        <th style="padding:8px;width:48px">No</th>
        <th style="padding:8px;width:140px">ID</th>
        <th style="padding:8px">Name</th>
        <th style="padding:8px;width:120px">Salary</th>
        <th style="padding:8px;width:220px">Actions</th>
      </tr>
    </thead><tbody>`;

  const q = (teachersSearch && teachersSearch.value||'').trim().toLowerCase();
  const subjFilter = (teachersSubjectFilter && teachersSubjectFilter.value) || '';
  let list = (teachersCache || []).slice();
  list = list.filter(t => {
    if(subjFilter && (!(t.subjects || []).includes(subjFilter))) return false;
    if(!q) return true;
    return (t.fullName||'').toLowerCase().includes(q) || (t.phone||'').toLowerCase().includes(q) || (t.id||'').toLowerCase().includes(q);
  });

  list.forEach((t, idx) => {
    const id = escape(t.id || t.teacherId || '');
    const name = escape(t.fullName || '');
    const salary = (typeof t.salary !== 'undefined' && t.salary !== null) ? escape(String(t.salary)) : '—';
    html += `<tr style="border-bottom:1px solid #f1f5f9">
      <td style="padding:8px;vertical-align:middle">${idx+1}</td>
      <td style="padding:8px;vertical-align:middle">${id}</td>
      <td style="padding:8px;vertical-align:middle">${name}</td>
      <td style="padding:8px;vertical-align:middle">${salary}</td>
      <td style="padding:8px;vertical-align:middle">
        <button class="btn btn-ghost btn-sm view-teacher" data-id="${id}">View</button>
        <button class="btn btn-ghost btn-sm edit-teacher" data-id="${id}">Edit</button>
        <button class="btn btn-danger btn-sm del-teacher" data-id="${id}">Delete</button>
      </td>
    </tr>`;
  });

  html += `</tbody></table></div>`;
  teachersList.innerHTML = html;

  // wire actions
  teachersList.querySelectorAll('.view-teacher').forEach(b => b.onclick = openViewTeacherModal);
  teachersList.querySelectorAll('.edit-teacher').forEach(b => b.onclick = openEditTeacherModal);
  teachersList.querySelectorAll('.del-teacher').forEach(b => b.onclick = deleteTeacher);
}

/** shows full teacher info in modal */
async function openViewTeacherModal(e){
  const id = e && e.target ? e.target.dataset.id : e;
  if(!id) return;
  // try cached, then DB
  let t = teachersCache.find(x => (x.id === id) || (x.teacherId === id) );
  if(!t){
    try {
      const snap = await getDoc(doc(db,'teachers', id));
      if(snap.exists()) t = { id: snap.id, ...snap.data() };
    } catch(err){ console.error('load teacher for view failed', err); }
  }
  if(!t) return toast('Teacher not found');
  // format classes & subjects
  const classesText = (t.classes && t.classes.length) ? t.classes.join(', ') : 'No classes';
  const subsText = (t.subjects && t.subjects.length) ? t.subjects.join(', ') : 'No subjects';
  const html = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div><strong>ID</strong><div class="muted">${escape(t.id || t.teacherId || '')}</div></div>
      <div><strong>Name</strong><div class="muted">${escape(t.fullName||'')}</div></div>
      <div><strong>Phone</strong><div class="muted">${escape(t.phone||'')}</div></div>
      <div><strong>Parent phone</strong><div class="muted">${escape(t.parentPhone||'')}</div></div>
      <div><strong>Salary</strong><div class="muted">${typeof t.salary !== 'undefined' ? escape(String(t.salary)) : '—'}</div></div>
      <div><strong>Created</strong><div class="muted">${t.createdAt ? (new Date(t.createdAt.seconds ? t.createdAt.seconds*1000 : t.createdAt)).toLocaleString() : '—'}</div></div>
      <div style="grid-column:1 / -1"><strong>Classes</strong><div class="muted">${escape(classesText)}</div></div>
      <div style="grid-column:1 / -1"><strong>Subjects</strong><div class="muted">${escape(subsText)}</div></div>
    </div>
    <div style="margin-top:12px"><button class="btn btn-ghost" id="viewTeacherClose">Close</button></div>
  `;
  showModal(`${escape(t.fullName||'')} — Teacher`, html);
  modalBody.querySelector('#viewTeacherClose').onclick = closeModal;
}

/** ---------- STUDENTS (table view + View modal) ---------- */
function renderStudents(){
  if(!studentsList) return;
  // filters
  const q = (studentsSearch && studentsSearch.value||'').trim().toLowerCase();
  const classFilterVal = (studentsClassFilter && studentsClassFilter.value) || '';
  const examFilter = (studentsExamForTotals && studentsExamForTotals.value) || '';

  let filtered = (studentsCache || []).filter(s=>{
    if(classFilterVal && s.classId !== classFilterVal) return false;
    if(!q) return true;
    return (s.fullName||'').toLowerCase().includes(q) || (s.phone||'').toLowerCase().includes(q) || (s.studentId||'').toLowerCase().includes(q);
  });

  // summary + table header
  const total = filtered.length;
  let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <strong>Total students: ${total}</strong>
      <div class="muted">Columns: No, ID, Name, Parent, Class, Total</div>
    </div>`;

  html += `<div style="overflow:auto"><table style="width:100%;border-collapse:collapse">
    <thead>
      <tr style="text-align:left;border-bottom:1px solid #e6eef8">
        <th style="padding:8px;width:48px">No</th>
        <th style="padding:8px;width:140px">ID</th>
        <th style="padding:8px">Name</th>
        <th style="padding:8px;width:160px">Parent</th>
        <th style="padding:8px;width:120px">Class</th>
        <th style="padding:8px;width:100px">Total</th>
        <th style="padding:8px;width:220px">Actions</th>
      </tr>
    </thead><tbody>`;

  // optionally start loading exam totals for the selected exam
  if(examFilter) loadExamTotalsForExam(examFilter);

  filtered.forEach((s, idx) => {
    const sid = escape(s.studentId || s.id || '');
    const parent = escape(s.parentPhone || s.motherName || '—');
    const cls = escape(s.classId || '—');
    let totalDisplay = '—';
    if(examFilter && examTotalsCache[examFilter] && examTotalsCache[examFilter][s.studentId]) totalDisplay = escape(String(examTotalsCache[examFilter][s.studentId].total || '—'));
    html += `<tr style="border-bottom:1px solid #f1f5f9">
      <td style="padding:8px;vertical-align:middle">${idx+1}</td>
      <td style="padding:8px;vertical-align:middle">${sid}</td>
      <td style="padding:8px;vertical-align:middle">${escape(s.fullName||'')}</td>
      <td style="padding:8px;vertical-align:middle">${parent}</td>
      <td style="padding:8px;vertical-align:middle">${cls}</td>
      <td style="padding:8px;vertical-align:middle">${totalDisplay}</td>
      <td style="padding:8px;vertical-align:middle">
        <button class="btn btn-ghost btn-sm view-stu" data-id="${sid}">View</button>
        <button class="btn btn-ghost btn-sm edit-stu" data-id="${sid}">Edit</button>
        <button class="btn btn-danger btn-sm del-stu" data-id="${sid}">${s.status==='deleted'?'Unblock':'Delete'}</button>
      </td>
    </tr>`;
  });

  html += `</tbody></table></div>`;
  studentsList.innerHTML = html;

  // wire actions
  studentsList.querySelectorAll('.view-stu').forEach(b=> b.onclick = openViewStudentModal);
  studentsList.querySelectorAll('.edit-stu').forEach(b=> b.onclick = openEditStudentModal);
  studentsList.querySelectorAll('.del-stu').forEach(b=> b.onclick = deleteOrUnblockStudent);
}

/** shows full student info in modal */
async function openViewStudentModal(e){
  const id = e && e.target ? e.target.dataset.id : e;
  if(!id) return;
  let s = studentsCache.find(x => x.studentId === id || x.id === id);
  if(!s){
    try {
      const snap = await getDoc(doc(db,'students', id));
      if(snap.exists()) s = { id: snap.id, ...snap.data() };
    } catch(err){ console.error('load student for view failed', err); }
  }
  if(!s) return toast('Student not found');
  // build html
  const html = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div><strong>ID</strong><div class="muted">${escape(s.studentId||s.id||'')}</div></div>
      <div><strong>Name</strong><div class="muted">${escape(s.fullName||'')}</div></div>
      <div><strong>Mother</strong><div class="muted">${escape(s.motherName||'')}</div></div>
      <div><strong>Phone</strong><div class="muted">${escape(s.phone||'')}</div></div>
      <div><strong>Parent phone</strong><div class="muted">${escape(s.parentPhone||'')}</div></div>
      <div><strong>Age</strong><div class="muted">${escape(String(s.age||'—'))}</div></div>
      <div><strong>Gender</strong><div class="muted">${escape(s.gender||'—')}</div></div>
      <div><strong>Fee</strong><div class="muted">${typeof s.fee !== 'undefined' ? escape(String(s.fee)) : '—'}</div></div>
      <div style="grid-column:1 / -1"><strong>Class</strong><div class="muted">${escape(s.classId||'—')}</div></div>
      <div style="grid-column:1 / -1"><strong>Status</strong><div class="muted">${escape(s.status||'active')}</div></div>
    </div>
    <div style="margin-top:12px"><button class="btn btn-ghost" id="viewStuClose">Close</button></div>
  `;
  showModal(`${escape(s.fullName||'Student')}`, html);
  modalBody.querySelector('#viewStuClose').onclick = closeModal;
}

/** ---------- CLASSES (table view + View modal listing students) ---------- */
function renderClasses(){
  if(!classesList) return;
  const q = (classSearch && classSearch.value||'').trim().toLowerCase();
  let list = (classesCache || []).slice();
  list = list.filter(c => {
    if(!q) return true;
    return (c.name||'').toLowerCase().includes(q) || (c.id||'').toLowerCase().includes(q);
  });

  const total = list.length;
  let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <strong>Total classes: ${total}</strong>
      <div class="muted">Columns: No, ID, Name, Total students</div>
    </div>`;

  html += `<div style="overflow:auto"><table style="width:100%;border-collapse:collapse">
    <thead>
      <tr style="text-align:left;border-bottom:1px solid #e6eef8">
        <th style="padding:8px;width:48px">No</th>
        <th style="padding:8px;width:140px">ID</th>
        <th style="padding:8px">Class</th>
        <th style="padding:8px;width:120px">Total students</th>
        <th style="padding:8px;width:220px">Actions</th>
      </tr>
    </thead><tbody>`;

  list.forEach((c, idx) => {
    const id = escape(c.id || '');
    const name = escape(c.name || '');
    const totalStudents = countStudentsInClass(c.name || '');
    html += `<tr style="border-bottom:1px solid #f1f5f9">
      <td style="padding:8px;vertical-align:middle">${idx+1}</td>
      <td style="padding:8px;vertical-align:middle">${id}</td>
      <td style="padding:8px;vertical-align:middle">${name}</td>
      <td style="padding:8px;vertical-align:middle">${totalStudents}</td>
      <td style="padding:8px;vertical-align:middle">
        <button class="btn btn-ghost btn-sm view-class" data-id="${id}">View</button>
        <button class="btn btn-ghost btn-sm edit-class" data-id="${id}">Edit</button>
        <button class="btn btn-danger btn-sm del-class" data-id="${id}">Delete</button>
      </td>
    </tr>`;
  });

  html += `</tbody></table></div>`;
  classesList.innerHTML = html;

  // wire actions
  classesList.querySelectorAll('.view-class').forEach(b=> b.onclick = openViewClassModal);
  classesList.querySelectorAll('.edit-class').forEach(b=> b.onclick = openEditClassModal);
  classesList.querySelectorAll('.del-class').forEach(b=> b.onclick = deleteClass);
}

/** view class -> show list of students in that class */
async function openViewClassModal(e){
  const id = e && e.target ? e.target.dataset.id : e;
  if(!id) return;
  const c = classesCache.find(x => x.id === id || x.name === id);
  if(!c) return toast('Class not found');

  // students assigned to this class
  const assigned = (studentsCache || []).filter(s => (s.classId || '') === (c.name || c.id || ''));

  let studentsHtml = '<div class="muted">No students</div>';
  if(assigned.length){
    studentsHtml = `<table style="width:100%;border-collapse:collapse">
      <thead><tr style="border-bottom:1px solid #e6eef8"><th style="padding:6px">No</th><th style="padding:6px">ID</th><th style="padding:6px">Name</th></tr></thead><tbody>`;
    assigned.forEach((s, i) => {
      studentsHtml += `<tr style="border-bottom:1px solid #f1f5f9"><td style="padding:6px">${i+1}</td><td style="padding:6px">${escape(s.studentId||s.id||'')}</td><td style="padding:6px">${escape(s.fullName||'')}</td></tr>`;
    });
    studentsHtml += '</tbody></table>';
  }

  const html = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div><strong>ID</strong><div class="muted">${escape(c.id||'')}</div></div>
      <div><strong>Class name</strong><div class="muted">${escape(c.name||'')}</div></div>
      <div style="grid-column:1 / -1"><strong>Subjects</strong><div class="muted">${escape((c.subjects||[]).join(', ') || 'No subjects')}</div></div>
      <div style="grid-column:1 / -1"><strong>Assigned students (${assigned.length})</strong>${studentsHtml}</div>
    </div>
    <div style="margin-top:12px"><button class="btn btn-ghost" id="viewClassClose">Close</button></div>
  `;
  showModal(`Class — ${escape(c.name||'')}`, html);
  modalBody.querySelector('#viewClassClose').onclick = closeModal;
}

/** ---------- SUBJECTS (table view + View modal) ---------- */
function renderSubjects(){
  if(!subjectsList) return;
  const q = (subjectSearch && subjectSearch.value||'').trim().toLowerCase();
  let list = (subjectsCache || []).slice();
  list = list.filter(s => {
    if(!q) return true;
    return (s.name||'').toLowerCase().includes(q) || (s.id||'').toLowerCase().includes(q);
  });

  const total = list.length;
  let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <strong>Total subjects: ${total}</strong>
      <div class="muted">Columns: No, ID, Subject</div>
    </div>`;

  html += `<div style="overflow:auto"><table style="width:100%;border-collapse:collapse">
    <thead>
      <tr style="text-align:left;border-bottom:1px solid #e6eef8">
        <th style="padding:8px;width:48px">No</th>
        <th style="padding:8px;width:140px">ID</th>
        <th style="padding:8px">Subject</th>
        <th style="padding:8px;width:220px">Actions</th>
      </tr>
    </thead><tbody>`;

  list.forEach((s, idx) => {
    const id = escape(s.id || '');
    const name = escape(s.name || '');
    html += `<tr style="border-bottom:1px solid #f1f5f9">
      <td style="padding:8px;vertical-align:middle">${idx+1}</td>
      <td style="padding:8px;vertical-align:middle">${id}</td>
      <td style="padding:8px;vertical-align:middle">${name}</td>
      <td style="padding:8px;vertical-align:middle">
        <button class="btn btn-ghost btn-sm view-sub" data-id="${id}">View</button>
        <button class="btn btn-ghost btn-sm edit-sub" data-id="${id}">Edit</button>
        <button class="btn btn-danger btn-sm del-sub" data-id="${id}">Delete</button>
      </td>
    </tr>`;
  });

  html += `</tbody></table></div>`;
  subjectsList.innerHTML = html;

  // wire actions
  subjectsList.querySelectorAll('.view-sub').forEach(b=> b.onclick = openViewSubjectModal);
  subjectsList.querySelectorAll('.edit-sub').forEach(b=> b.onclick = openEditSubjectModal);
  subjectsList.querySelectorAll('.del-sub').forEach(b=> b.onclick = deleteSubject);
}

/** view subject -> show how many classes include it (and which) */
function openViewSubjectModal(e){
  const id = e && e.target ? e.target.dataset.id : e;
  if(!id) return;
  const s = subjectsCache.find(x => x.id === id || x.name === id);
  if(!s) return toast('Subject not found');

  // classes including this subject
  const includedIn = (classesCache || []).filter(c => Array.isArray(c.subjects) && c.subjects.includes(s.name || s.id));
  const classesHtml = includedIn.length ? `<div class="muted">${includedIn.map(c => escape(c.name)).join(', ')}</div>` : `<div class="muted">Not part of any class</div>`;
  const html = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div><strong>ID</strong><div class="muted">${escape(s.id||'')}</div></div>
      <div><strong>Subject</strong><div class="muted">${escape(s.name||'')}</div></div>
      <div style="grid-column:1 / -1"><strong>Used in classes (${includedIn.length})</strong>${classesHtml}</div>
    </div>
    <div style="margin-top:12px"><button class="btn btn-ghost" id="viewSubClose">Close</button></div>
  `;
  showModal(`Subject — ${escape(s.name||'')}`, html);
  modalBody.querySelector('#viewSubClose').onclick = closeModal;
}

/* -------------------------
   End of new render & view helpers
---------------------------*/
