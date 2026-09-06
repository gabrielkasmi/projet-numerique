/* Boîte du magistrat — logique de l'application (front only, aucune dépendance serveur).
 * Les documents (scans + extraction OCR) viennent de data.js (généré par generate_data.py).
 * L'état de traitement (édition des champs, classement, poursuites) est conservé dans le
 * localStorage du navigateur : il n'y a pas de base de données partagée dans ce prototype.
 */

// ---------------------------------------------------------------------------
// Référentiel des motifs de classement sans suite
// ---------------------------------------------------------------------------
const MOTIFS = [
  { category: "Absence d'infraction / infraction non caractérisée", items: [
    { code: '11', label: "Absence d'infraction" },
    { code: '21', label: "Infraction insuffisamment caractérisée" },
  ]},
  { category: "Extinction de l'action publique", items: [
    { code: '31', label: "Retrait de plainte obligatoire" },
    { code: '32', label: "Amnistie" },
    { code: '33', label: "Transaction" },
    { code: '341', label: "Décès du mis en cause" },
    { code: '342', label: "Abrogation de la loi pénale" },
    { code: '343', label: "Chose jugée" },
    { code: '344', label: "Prescription de l'action publique" },
  ]},
  { category: "Immunité", items: [
    { code: '35', label: "Immunité" },
  ]},
  { category: "Irrégularité de la procédure", items: [
    { code: '36', label: "Irrégularité de la procédure" },
  ]},
  { category: "Irresponsabilité de l'auteur", items: [
    { code: '37', label: "Irresponsabilité de l'auteur (trouble psychique, légitime défense…)" },
  ]},
  { category: "Poursuite inopportune", items: [
    { code: '41', label: "Auteur identifié mais non localisé" },
    { code: '42', label: "Désistement du plaignant" },
    { code: '43', label: "État mental déficient" },
    { code: '44', label: "Carence du plaignant" },
    { code: '45', label: "Comportement de la victime" },
    { code: '46', label: "Victime désintéressée d'office" },
    { code: '47', label: "Régularisation d'office" },
    { code: '48', label: "Préjudice ou trouble peu important" },
  ]},
  { category: "Procédure alternative aboutie", items: [
    { code: '51', label: "Réparation / mineur" },
    { code: '52', label: "Médiation" },
    { code: '53', label: "Injonction thérapeutique" },
    { code: '54', label: "Plaignant désintéressé sur demande du parquet" },
    { code: '55', label: "Régularisation sur demande du parquet" },
    { code: '56', label: "Rappel à la loi / avertissement pénal probatoire" },
    { code: '57', label: "Orientation vers structure sanitaire ou sociale" },
    { code: '58', label: "Composition pénale réussie" },
  ]},
  { category: "Autres", items: [
    { code: '61', label: "Autres poursuites ou sanctions non pénales" },
    { code: '71', label: "Auteur inconnu" },
    { code: '81', label: "Non-lieu à assistance éducative" },
  ]},
];

const POURSUITE_TYPES = [
  "Enquête (préliminaire ou de flagrance)",
  "Alternative aux poursuites",
  "Saisine du tribunal correctionnel",
  "Ouverture d'une information judiciaire",
];

// ---------------------------------------------------------------------------
// État persistant (localStorage)
// ---------------------------------------------------------------------------
const STATE_KEY = 'magistrat_mailbox_state_v1';

function loadState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { console.warn('Lecture du localStorage impossible :', e); }
  return { docs: {} };
}
function saveState() {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(STATE)); }
  catch (e) { console.warn('Écriture du localStorage impossible :', e); }
}
let STATE = loadState();
if (!STATE.docs) STATE.docs = {};

function getStatus(id) { return (STATE.docs[id] && STATE.docs[id].status) || 'nontraite'; }

function setFieldValue(id, key, value) {
  if (!STATE.docs[id]) STATE.docs[id] = { fields: {} };
  if (!STATE.docs[id].fields) STATE.docs[id].fields = {};
  const raw = DOCUMENTS.find(d => d.id === id);
  const orig = flattenOriginal(raw)[key];
  if (value === orig) delete STATE.docs[id].fields[key];
  else STATE.docs[id].fields[key] = value;
  saveState();
}

function recordDecision(id, data) {
  if (!STATE.docs[id]) STATE.docs[id] = { fields: {} };
  Object.assign(STATE.docs[id], data);
  saveState();
}

// ---------------------------------------------------------------------------
// Modèle document : original (data.js) + surcouche d'édition (STATE)
// ---------------------------------------------------------------------------
function flattenOriginal(raw) {
  return {
    id: raw.id,
    imageData: raw.imageData,
    imageMime: raw.imageMime,
    imageFile: raw.imageFile,
    sourceFile: raw.sourceFile,
    name: (raw.sender && raw.sender.name) || '',
    street: (raw.sender && raw.sender.address && raw.sender.address.street) || '',
    postal: (raw.sender && raw.sender.address && raw.sender.address.postal_code) || '',
    city: (raw.sender && raw.sender.address && raw.sender.address.city) || '',
    phone: (raw.sender && raw.sender.phone_number) || '',
    email: (raw.sender && raw.sender.email) || '',
    date: raw.document_date || '',
    subject: raw.subject || '',
    type: raw.type_of_offense || '',
    minor: raw.minor_involved || 'N',
    who: ((raw.keywords_content && raw.keywords_content.who) || []).join('\n'),
    when: ((raw.keywords_content && raw.keywords_content.when) || []).join('\n'),
    what: ((raw.keywords_content && raw.keywords_content.what) || []).join('\n'),
    how: ((raw.keywords_content && raw.keywords_content.how) || []).join('\n'),
  };
}

function mergedDoc(id) {
  const raw = DOCUMENTS.find(d => d.id === id);
  const flat = flattenOriginal(raw);
  const overrides = (STATE.docs[id] && STATE.docs[id].fields) || {};
  return Object.assign({}, flat, overrides, { _original: flat });
}

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------
function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
function escapeAttr(str) { return escapeHtml(str); }

function slug(str) {
  return String(str || 'document')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'document';
}

function formatTs(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('fr-FR');
}

const FR_MONTHS = {
  janvier: 0, février: 1, fevrier: 1, mars: 2, avril: 3, mai: 4, juin: 5,
  juillet: 6, août: 7, aout: 7, septembre: 8, octobre: 9, novembre: 10,
  décembre: 11, decembre: 11,
};
function parseDateFlexible(str) {
  if (!str) return null;
  let m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = str.match(/(\d{1,2})\s+([a-zéûôA-ZÉÛÔ]+)\s+(\d{4})/);
  if (m) {
    const month = FR_MONTHS[m[2].toLowerCase()];
    if (month !== undefined) return new Date(+m[3], month, +m[1]);
  }
  const d = new Date(str);
  return isNaN(d) ? null : d;
}

function typeLabel(t) { return { bien: 'Bien', personne: 'Personne', nation: 'Nation' }[t] || (t || '—'); }

function statusBadge(status) {
  if (status === 'classe') return '<span class="badge badge-classe">Classé sans suite</span>';
  if (status === 'poursuites') return '<span class="badge badge-poursuites">Poursuites engagées</span>';
  return '<span class="badge badge-nontraite">Non traité</span>';
}

let toastTimer = null;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// ---------------------------------------------------------------------------
// Génération du document de classement (Word)
// ---------------------------------------------------------------------------
async function generateClassementDocument(d, motif, comment) {
  if (window.docx && window.docx.Document) {
    try { await generateClassementDocx(d, motif, comment); return; }
    catch (e) { console.error('Génération .docx impossible, repli en .doc :', e); }
  }
  generateClassementDocHtml(d, motif, comment);
}

async function generateClassementDocx(d, motif, comment) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = window.docx;
  const today = new Date().toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });
  const addressLine = [d.street, [d.postal, d.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const par = (text, opts = {}) => new Paragraph({ children: [new TextRun(Object.assign({ text }, opts))], spacing: { after: 160 } });

  const children = [
    new Paragraph({ text: 'PARQUET DE LA RÉPUBLIQUE', heading: HeadingLevel.HEADING_3 }),
    par(`Réf. dossier : ${d.id}`),
    par(`Objet : ${d.subject || ''}`),
    new Paragraph({ text: '', spacing: { after: 200 } }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'AVIS DE CLASSEMENT SANS SUITE', bold: true, size: 26 })],
      spacing: { after: 300 },
    }),
    par('Le Procureur de la République,'),
    par(`Vu la procédure susvisée, reçue le ${d.date || '[date]'},`),
    par(`Vu le courrier adressé par ${d.name || '[expéditeur]'}${addressLine ? ', demeurant ' + addressLine : ''}, relatif à : « ${d.subject || ''} »,`),
    par('Après examen des éléments du dossier,'),
    new Paragraph({ children: [new TextRun({ text: 'DÉCIDE de classer sans suite la présente procédure.', bold: true })], spacing: { after: 200 } }),
    new Paragraph({
      children: [new TextRun({ text: 'Motif de classement : ', bold: true }), new TextRun({ text: `${motif.code} — ${motif.label}` })],
      spacing: { after: 200 },
    }),
    new Paragraph({ children: [new TextRun({ text: 'Observations du magistrat :', bold: true })], spacing: { after: 80 } }),
    par(comment && comment.trim() ? comment.trim() : '[Aucune observation complémentaire]'),
    new Paragraph({ text: '', spacing: { after: 400 } }),
    par(`Fait à _______________________, le ${today}`),
    new Paragraph({ text: '', spacing: { after: 400 } }),
    par('Le Procureur de la République', { bold: true }),
    par('(ou le magistrat du parquet délégataire)'),
    new Paragraph({ text: '', spacing: { after: 400 } }),
    new Paragraph({ children: [new TextRun({ text: "Cet avis est notifié au plaignant conformément à l'article 40-2 du code de procédure pénale.", italics: true, size: 18 })] }),
  ];

  const document = new Document({ sections: [{ properties: {}, children }] });
  const blob = await Packer.toBlob(document);
  downloadBlob(blob, `Classement_${slug(d.name)}_${d.id}.docx`);
}

function generateClassementDocHtml(d, motif, comment) {
  const today = new Date().toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });
  const addressLine = [d.street, [d.postal, d.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const html = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head><meta charset="utf-8"><title>Classement</title>
<style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.4;} h1{font-size:14pt;text-align:center;} .b{font-weight:bold;} .i{font-style:italic;font-size:9pt;}</style>
</head><body>
<p>PARQUET DE LA RÉPUBLIQUE</p>
<p>Réf. dossier : ${escapeHtml(d.id)}<br>Objet : ${escapeHtml(d.subject || '')}</p>
<h1>AVIS DE CLASSEMENT SANS SUITE</h1>
<p>Le Procureur de la République,</p>
<p>Vu la procédure susvisée, reçue le ${escapeHtml(d.date || '[date]')},</p>
<p>Vu le courrier adressé par ${escapeHtml(d.name || '[expéditeur]')}${addressLine ? ', demeurant ' + escapeHtml(addressLine) : ''}, relatif à : « ${escapeHtml(d.subject || '')} »,</p>
<p>Après examen des éléments du dossier,</p>
<p class="b">DÉCIDE de classer sans suite la présente procédure.</p>
<p><span class="b">Motif de classement : </span>${escapeHtml(motif.code)} — ${escapeHtml(motif.label)}</p>
<p class="b">Observations du magistrat :</p>
<p>${escapeHtml(comment && comment.trim() ? comment.trim() : '[Aucune observation complémentaire]')}</p>
<p>&nbsp;</p>
<p>Fait à _______________________, le ${today}</p>
<p>&nbsp;</p>
<p class="b">Le Procureur de la République</p>
<p>(ou le magistrat du parquet délégataire)</p>
<p>&nbsp;</p>
<p class="i">Cet avis est notifié au plaignant conformément à l'article 40-2 du code de procédure pénale.</p>
</body></html>`;
  const blob = new Blob(['﻿', html], { type: 'application/msword' });
  downloadBlob(blob, `Classement_${slug(d.name)}_${d.id}.doc`);
}

// ---------------------------------------------------------------------------
// État d'affichage (non persistant)
// ---------------------------------------------------------------------------
let selectedId = null;
let lbZoom = 1;             // zoom du scan en grand (lightbox)
let pendingAction = null;   // 'classer' | 'poursuite' | null
let selectedMotif = null;   // { code, label }

// ---------------------------------------------------------------------------
// Rendu — liste des courriers
// ---------------------------------------------------------------------------
function renderMailList() {
  const q = (document.getElementById('search-input').value || '').toLowerCase().trim();
  const items = DOCUMENTS.map(raw => mergedDoc(raw.id))
    .filter(d => !q || (d.name + ' ' + d.subject).toLowerCase().includes(q))
    .sort((a, b) => {
      const da = parseDateFlexible(a.date), db = parseDateFlexible(b.date);
      if (da && db) return db - da;
      return 0;
    });

  document.getElementById('list-count').textContent = items.length;
  document.getElementById('topbar-count').textContent = DOCUMENTS.length + ' ';

  const wrap = document.getElementById('mail-items');
  wrap.innerHTML = '';
  items.forEach(d => {
    const status = getStatus(d.id);
    const el = document.createElement('div');
    el.className = 'mail-item' + (d.id === selectedId ? ' selected' : '');
    el.addEventListener('click', () => selectDoc(d.id));
    el.innerHTML = `
      <div class="row1">
        <span class="sender">${escapeHtml(d.name || '(expéditeur inconnu)')}</span>
        <span class="date">${escapeHtml(d.date || '')}</span>
      </div>
      <div class="subject">${escapeHtml(d.subject || '')}</div>
      <div class="meta-row">${statusBadge(status)}${d.minor === 'O' ? '<span class="badge badge-mineur">Mineur</span>' : ''}</div>
    `;
    wrap.appendChild(el);
  });

  renderMiniStats();
}

function selectDoc(id) {
  selectedId = id;
  pendingAction = null;
  selectedMotif = null;
  renderMailList();
  showReader(id);
}

// ---------------------------------------------------------------------------
// Zone de lecture : vignette + extraction (gauche) / décision (droite)
// ---------------------------------------------------------------------------
function showReader(id) {
  selectedId = id;
  const raw = DOCUMENTS.find(d => d.id === id);
  const d = mergedDoc(id);
  document.getElementById('reader-title').textContent = d.name || 'Expéditeur inconnu';
  document.getElementById('reader-docid').textContent = `Dossier ${d.id} · fichier source ${d.sourceFile}`;
  document.getElementById('thumb-img').src = `data:${raw.imageMime};base64,${raw.imageData}`;
  document.getElementById('reader-empty').style.display = 'none';
  document.getElementById('reader-content').style.display = 'flex';
  renderReaderFields();
}

function openLightbox() {
  if (!selectedId) return;
  const raw = DOCUMENTS.find(d => d.id === selectedId);
  lbZoom = 1;
  const img = document.getElementById('lightbox-img');
  img.src = `data:${raw.imageMime};base64,${raw.imageData}`;
  applyLbZoom();
  document.getElementById('lb-fname').textContent = raw.imageFile;
  document.getElementById('lightbox').classList.add('open');
}

function closeLightbox() {
  document.getElementById('lightbox').classList.remove('open');
}

function applyLbZoom() {
  const img = document.getElementById('lightbox-img');
  if (img) img.style.transform = `scale(${lbZoom})`;
}

function fieldHtml(d, key, label, kind) {
  const edited = d[key] !== d._original[key];
  if (kind === 'textarea') {
    return `<div class="field${edited ? ' is-edited' : ''}">
      <label><span class="edited-dot"></span>${label}</label>
      <textarea data-field="${key}">${escapeHtml(d[key] || '')}</textarea>
    </div>`;
  }
  return `<div class="field${edited ? ' is-edited' : ''}">
    <label><span class="edited-dot"></span>${label}</label>
    <input type="text" data-field="${key}" value="${escapeAttr(d[key] || '')}">
  </div>`;
}

function selectFieldHtml(d, key, label, options) {
  const edited = d[key] !== d._original[key];
  const opts = options.map(([v, l]) => `<option value="${v}" ${d[key] === v ? 'selected' : ''}>${l}</option>`).join('');
  return `<div class="field${edited ? ' is-edited' : ''}">
    <label><span class="edited-dot"></span>${label}</label>
    <select data-field="${key}">${opts}</select>
  </div>`;
}

function renderReaderFields() {
  const d = mergedDoc(selectedId);
  const scroll = document.getElementById('reader-fields');
  scroll.innerHTML = `
    <fieldset>
      <legend>Expéditeur</legend>
      ${fieldHtml(d, 'name', 'Nom')}
      <div class="two-col">${fieldHtml(d, 'street', 'Rue')}${fieldHtml(d, 'postal', 'Code postal')}</div>
      <div class="two-col">${fieldHtml(d, 'city', 'Ville')}${fieldHtml(d, 'phone', 'Téléphone')}</div>
      ${fieldHtml(d, 'email', 'Email')}
    </fieldset>

    <fieldset>
      <legend>Courrier</legend>
      <div class="two-col">
        ${fieldHtml(d, 'date', 'Date du courrier')}
        ${selectFieldHtml(d, 'type', "Type d'atteinte", [['bien', 'Bien'], ['personne', 'Personne'], ['nation', 'Nation']])}
      </div>
      ${fieldHtml(d, 'subject', 'Objet', 'textarea')}
      ${selectFieldHtml(d, 'minor', 'Mineur impliqué', [['N', 'Non'], ['O', 'Oui']])}
    </fieldset>

    <fieldset>
      <legend>Mots-clés du contenu</legend>
      ${fieldHtml(d, 'who', 'Qui — un élément par ligne', 'textarea')}
      ${fieldHtml(d, 'when', 'Quand — un élément par ligne', 'textarea')}
      ${fieldHtml(d, 'what', 'Quoi — un élément par ligne', 'textarea')}
      ${fieldHtml(d, 'how', 'Comment — un élément par ligne', 'textarea')}
    </fieldset>
  `;

  scroll.querySelectorAll('[data-field]').forEach(el => {
    el.addEventListener('change', () => {
      setFieldValue(selectedId, el.dataset.field, el.value);
      renderReaderFields();
      renderMailList();
    });
  });

  renderReaderDecision();
}

// ---------------------------------------------------------------------------
// Rendu — panneau de décision (classement / poursuites)
// ---------------------------------------------------------------------------
function renderReaderDecision() {
  const box = document.getElementById('reader-decision');
  const d = mergedDoc(selectedId);
  const rec = STATE.docs[selectedId] || {};
  const status = getStatus(selectedId);

  if (pendingAction === 'classer') {
    box.innerHTML = classementFormHtml(d, rec);
    wireClassementForm(d);
    return;
  }
  if (pendingAction === 'poursuite') {
    box.innerHTML = poursuiteFormHtml(rec);
    wirePoursuiteForm();
    return;
  }

  if (status === 'nontraite') {
    box.innerHTML = `
      <div class="action-buttons-col">
        <button class="btn btn-classer" id="btn-classer">Classer sans suite</button>
        <button class="btn btn-poursuite" id="btn-poursuite">Engager des poursuites</button>
      </div>`;
    document.getElementById('btn-classer').addEventListener('click', () => {
      pendingAction = 'classer'; selectedMotif = null; renderReaderDecision();
    });
    document.getElementById('btn-poursuite').addEventListener('click', () => {
      pendingAction = 'poursuite'; renderReaderDecision();
    });
    return;
  }

  box.innerHTML = decisionSummaryHtml(rec);
  const editBtn = document.getElementById('btn-edit-decision');
  if (editBtn) {
    editBtn.addEventListener('click', () => {
      if (rec.status === 'classe') {
        pendingAction = 'classer';
        selectedMotif = { code: rec.motifCode, label: rec.motifLabel };
      } else {
        pendingAction = 'poursuite';
      }
      renderReaderDecision();
    });
  }
}

function decisionSummaryHtml(rec) {
  if (rec.status === 'classe') {
    return `
      <h3>Décision</h3>
      <div class="decision-summary">
        <div class="label">Statut</div><div class="value">Classé sans suite</div>
        <div class="label">Motif</div><div class="value">${escapeHtml(rec.motifCode)} — ${escapeHtml(rec.motifLabel)}</div>
        ${rec.comment ? `<div class="label">Observations</div><div class="note">${escapeHtml(rec.comment)}</div>` : ''}
        <div class="label" style="margin-top:8px;">Décidé le</div><div class="value">${escapeHtml(formatTs(rec.decidedAt))}</div>
      </div>
      <div class="decision-actions">
        <button class="btn btn-secondary" id="btn-edit-decision">Modifier la décision</button>
      </div>`;
  }
  return `
    <h3>Décision</h3>
    <div class="decision-summary">
      <div class="label">Statut</div><div class="value">Poursuites engagées</div>
      <div class="label">Orientation</div><div class="value">${escapeHtml(rec.poursuiteType || '—')}</div>
      ${rec.poursuiteNote ? `<div class="label">Note</div><div class="note">${escapeHtml(rec.poursuiteNote)}</div>` : ''}
      <div class="label" style="margin-top:8px;">Décidé le</div><div class="value">${escapeHtml(formatTs(rec.decidedAt))}</div>
    </div>
    <div class="decision-actions">
      <button class="btn btn-secondary" id="btn-edit-decision">Modifier la décision</button>
    </div>`;
}

function classementFormHtml(d, rec) {
  const commentVal = rec.comment || '';
  const groups = MOTIFS.map(g => {
    const items = g.items.map(it => {
      const sel = selectedMotif && selectedMotif.code === it.code;
      return `<div class="motif-item${sel ? ' selected' : ''}" data-code="${it.code}" data-label="${escapeAttr(it.label)}">
        <span class="code">${it.code}</span><span>${escapeHtml(it.label)}</span>
      </div>`;
    }).join('');
    const isOpen = g.items.some(it => selectedMotif && selectedMotif.code === it.code);
    return `<details class="motif-group" ${isOpen ? 'open' : ''}>
      <summary>${escapeHtml(g.category)}</summary>
      <div class="motif-list">${items}</div>
    </details>`;
  }).join('');

  return `
    <h3>Classement sans suite</h3>
    <div class="decision-panel">
      <h4>Motif de classement</h4>
      ${groups}
      <div class="field" style="margin-top:10px;">
        <label>Observations du magistrat (facultatif)</label>
        <textarea id="classement-comment" placeholder="Précisions à faire figurer dans l'avis…">${escapeHtml(commentVal)}</textarea>
      </div>
      <div class="decision-actions">
        <button class="btn btn-primary" id="btn-generate-classement">Générer le document et classer</button>
        <button class="btn btn-secondary" id="btn-cancel-classement">Annuler</button>
      </div>
    </div>`;
}

function wireClassementForm(d) {
  document.querySelectorAll('.motif-item').forEach(el => {
    el.addEventListener('click', () => {
      selectedMotif = { code: el.dataset.code, label: el.dataset.label };
      renderReaderDecision();
    });
  });
  document.getElementById('btn-cancel-classement').addEventListener('click', () => {
    pendingAction = null; renderReaderDecision();
  });
  document.getElementById('btn-generate-classement').addEventListener('click', async () => {
    if (!selectedMotif) { toast('Sélectionnez un motif de classement.'); return; }
    const comment = document.getElementById('classement-comment').value;
    const btn = document.getElementById('btn-generate-classement');
    btn.disabled = true; btn.textContent = 'Génération…';
    try {
      await generateClassementDocument(d, selectedMotif, comment);
      recordDecision(selectedId, {
        status: 'classe', motifCode: selectedMotif.code, motifLabel: selectedMotif.label,
        comment, decidedAt: Date.now(),
      });
      pendingAction = null;
      renderMailList();
      renderReaderFields();
      renderDbTable();
      toast('Document de classement généré et téléchargé.');
    } catch (e) {
      console.error(e);
      toast('Erreur lors de la génération du document.');
      btn.disabled = false; btn.textContent = 'Générer le document et classer';
    }
  });
}

function poursuiteFormHtml(rec) {
  const typeVal = rec.poursuiteType || POURSUITE_TYPES[0];
  const noteVal = rec.poursuiteNote || '';
  const opts = POURSUITE_TYPES.map(t => `<option value="${escapeAttr(t)}" ${t === typeVal ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('');
  return `
    <h3>Engager des poursuites</h3>
    <div class="decision-panel">
      <div class="field">
        <label>Orientation</label>
        <select id="poursuite-type">${opts}</select>
      </div>
      <div class="field">
        <label>Note de suivi (facultatif)</label>
        <textarea id="poursuite-note" placeholder="Instructions pour le bureau d'ordre / le service enquêteur…">${escapeHtml(noteVal)}</textarea>
      </div>
      <div class="decision-actions">
        <button class="btn btn-primary" id="btn-confirm-poursuite">Confirmer</button>
        <button class="btn btn-secondary" id="btn-cancel-poursuite">Annuler</button>
      </div>
    </div>`;
}

function wirePoursuiteForm() {
  document.getElementById('btn-cancel-poursuite').addEventListener('click', () => {
    pendingAction = null; renderReaderDecision();
  });
  document.getElementById('btn-confirm-poursuite').addEventListener('click', () => {
    const poursuiteType = document.getElementById('poursuite-type').value;
    const poursuiteNote = document.getElementById('poursuite-note').value;
    recordDecision(selectedId, { status: 'poursuites', poursuiteType, poursuiteNote, decidedAt: Date.now() });
    pendingAction = null;
    renderMailList();
    renderReaderFields();
    renderDbTable();
    toast('Poursuites engagées, courrier mis à jour.');
  });
}

// ---------------------------------------------------------------------------
// Rendu — onglet "Base de données"
// ---------------------------------------------------------------------------
function renderDbTable() {
  const tbody = document.getElementById('db-tbody');
  tbody.innerHTML = '';
  DOCUMENTS.map(raw => mergedDoc(raw.id)).forEach(d => {
    const rec = STATE.docs[d.id] || {};
    const status = getStatus(d.id);
    let orientation = '—';
    if (status === 'classe') orientation = `${rec.motifCode} — ${rec.motifLabel}`;
    else if (status === 'poursuites') orientation = rec.poursuiteType || '—';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(d.name || '—')}</td>
      <td>${escapeHtml(d.subject || '—')}</td>
      <td>${escapeHtml(d.date || '—')}</td>
      <td>${escapeHtml(typeLabel(d.type))}</td>
      <td>${d.minor === 'O' ? 'Oui' : 'Non'}</td>
      <td>${statusBadge(status)}</td>
      <td>${escapeHtml(orientation)}</td>
      <td><button class="link-btn" data-id="${d.id}">Ouvrir</button></td>
    `;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('.link-btn').forEach(btn => {
    btn.addEventListener('click', () => selectDoc(btn.dataset.id));
  });
}

function renderMiniStats() {
  const el = document.getElementById('mini-stats');
  if (!el) return;
  const all = DOCUMENTS.map(raw => getStatus(raw.id));
  const counts = {
    nontraite: all.filter(s => s === 'nontraite').length,
    classe: all.filter(s => s === 'classe').length,
    poursuites: all.filter(s => s === 'poursuites').length,
  };
  el.innerHTML = `
    <div class="stat"><div class="num">${counts.nontraite}</div><div class="lbl">Non traités</div></div>
    <div class="stat"><div class="num">${counts.classe}</div><div class="lbl">Classés sans suite</div></div>
    <div class="stat"><div class="num">${counts.poursuites}</div><div class="lbl">Poursuites engagées</div></div>
  `;
}

// ---------------------------------------------------------------------------
// Onglets
// ---------------------------------------------------------------------------
function switchView(view) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  document.getElementById('view-mail').classList.toggle('active', view === 'mail');
  document.getElementById('view-db').classList.toggle('active', view === 'db');
  if (view === 'db') renderDbTable();
}

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------
function initStaticListeners() {
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.addEventListener('click', () => switchView(b.dataset.view));
  });
  document.getElementById('search-input').addEventListener('input', renderMailList);

  // vignette -> scan en grand
  document.getElementById('btn-view-scan').addEventListener('click', openLightbox);
  document.getElementById('thumb-img').addEventListener('click', openLightbox);

  // scan en grand
  document.getElementById('lb-close').addEventListener('click', closeLightbox);
  document.getElementById('lightbox').addEventListener('click', (e) => {
    if (e.target.id === 'lightbox') closeLightbox();
  });
  document.getElementById('lb-zoom-in').addEventListener('click', () => { lbZoom = Math.min(3, lbZoom + 0.2); applyLbZoom(); });
  document.getElementById('lb-zoom-out').addEventListener('click', () => { lbZoom = Math.max(0.4, lbZoom - 0.2); applyLbZoom(); });
  document.getElementById('lb-zoom-reset').addEventListener('click', () => { lbZoom = 1; applyLbZoom(); });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.getElementById('lightbox').classList.contains('open')) closeLightbox();
  });
}

function init() {
  if (typeof DOCUMENTS === 'undefined' || !DOCUMENTS.length) {
    document.getElementById('mail-items').innerHTML = '<div style="padding:16px;color:#888;font-size:13px;">Aucun document trouvé. Lancez <code>python3 generate_data.py</code> dans le dossier <code>mailbox-app</code>.</div>';
    return;
  }
  initStaticListeners();
  renderMailList();
  renderDbTable();
}

init();
