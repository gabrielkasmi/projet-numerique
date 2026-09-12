/* Boîte du magistrat — logique de l'application (front only, aucune dépendance serveur).
 * Les documents (scans + extraction OCR) viennent de data.js (généré par generate_data.py).
 * L'état de traitement (édition des champs, décisions, signalements) est conservé dans le
 * localStorage du navigateur : il n'y a pas de base de données partagée dans ce prototype.
 *
 * Outil de démonstration : les plaintes et courriers affichés ici sont entièrement fictifs.
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
// Répertoire de réorientation (mock) — magistrats nommés + services génériques
// (adresse mail générique, sans destinataire nominatif) proposés dans le
// champ de tag « @ » du formulaire de réorientation.
// ---------------------------------------------------------------------------
const MAGISTRATS = [
  { id: 'm1', name: 'Camille Fabre', role: "Substitut du procureur — section mineurs", email: 'camille.fabre@tribunal-demo.fr' },
  { id: 'm2', name: 'Antoine Roussel', role: "Substitut du procureur — atteintes aux biens", email: 'antoine.roussel@tribunal-demo.fr' },
  { id: 'm3', name: 'Nadia Cherif', role: "Vice-procureure — atteintes aux personnes", email: 'nadia.cherif@tribunal-demo.fr' },
  { id: 'm4', name: 'Julien Mercier', role: "Substitut du procureur — cybercriminalité", email: 'julien.mercier@tribunal-demo.fr' },
  { id: 'm5', name: 'Élise Bonnet', role: "Substitut du procureur — permanence", email: 'elise.bonnet@tribunal-demo.fr' },
  { id: 'm6', name: 'Thomas Lefèvre', role: "Juge des enfants", email: 'thomas.lefevre@tribunal-demo.fr' },
];

const SERVICES = [
  { id: 's1', name: 'Section mineurs', role: 'Service — boîte générique', email: 'section.mineurs@tribunal-demo.fr' },
  { id: 's2', name: 'Pôle atteintes aux biens', role: 'Service — boîte générique', email: 'pole.biens@tribunal-demo.fr' },
  { id: 's3', name: 'Section cybercriminalité', role: 'Service — boîte générique', email: 'cybercriminalite@tribunal-demo.fr' },
  { id: 's4', name: 'Permanence pénale', role: 'Service — boîte générique', email: 'permanence.penale@tribunal-demo.fr' },
  { id: 's5', name: "BOP général", role: 'Service — boîte générique', email: 'bop@tribunal-demo.fr' },
];

const REORIENTATION_TARGETS = [
  ...MAGISTRATS.map(m => Object.assign({ kind: 'magistrat' }, m)),
  ...SERVICES.map(s => Object.assign({ kind: 'service' }, s)),
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

function addSignalement(id, text) {
  if (!STATE.docs[id]) STATE.docs[id] = { fields: {} };
  if (!STATE.docs[id].comments) STATE.docs[id].comments = [];
  STATE.docs[id].comments.push({ text, ts: Date.now() });
  saveState();
}

function getComments(id) {
  return (STATE.docs[id] && STATE.docs[id].comments) || [];
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
    minor: raw.minor_involved || '',
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

function typeLabel(t) { return t && String(t).trim() ? t : '—'; }

function statusBadge(status) {
  if (status === 'classe') return '<span class="badge badge-classe">Classé sans suite</span>';
  if (status === 'poursuites') return '<span class="badge badge-poursuites">Poursuites engagées</span>';
  if (status === 'reoriente') return '<span class="badge badge-reoriente">Réorienté</span>';
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

// Mention rappelée dans les documents générés automatiquement (voir bandeau
// d'avertissement de l'interface) : aucun document réel n'a servi de base.
const DEMO_DOC_DISCLAIMER = "Document produit dans le cadre d'un outil de démonstration : faits, identités et pièces mentionnés sont entièrement fictifs et ne correspondent à aucune procédure réelle. La conception de cet outil n'a nécessité l'usage d'aucun document émanant d'une juridiction.";

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
    new Paragraph({ children: [new TextRun({ text: DEMO_DOC_DISCLAIMER, italics: true, size: 16, color: '999999' })], spacing: { before: 300 } }),
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
<p class="i" style="color:#999;">${escapeHtml(DEMO_DOC_DISCLAIMER)}</p>
</body></html>`;
  const blob = new Blob(['﻿', html], { type: 'application/msword' });
  downloadBlob(blob, `Classement_${slug(d.name)}_${d.id}.doc`);
}

// ---------------------------------------------------------------------------
// Mots-clés : champ "keyword"/"keywords" du template, sinon extraction des
// mots communs à plusieurs objets (subject) du corpus.
// ---------------------------------------------------------------------------
const FR_STOPWORDS = new Set([
  'les', 'des', 'une', 'un', 'de', 'la', 'le', 'et', 'à', 'au', 'aux', 'pour', 'par', 'sur', 'dans',
  'avec', 'ce', 'cette', 'ces', 'en', 'du', 'que', 'qui', 'son', 'sa', 'ses', 'plus', 'sans', 'ou',
  'ne', 'pas', 'est', 'été', 'être', 'avoir', 'ont', 'sont', 'mon', 'ma', 'mes', 'se', 'leur', 'leurs',
  'vers', 'chez', 'entre', 'deux', 'tout', 'toute', 'tous', 'toutes', 'fait', 'faits', 'plainte',
  'courrier', 'madame', 'monsieur', 'contre', 'formelle', 'dépôt', 'depuis', 'lors',
]);

function tokenizeSubject(subject) {
  return (subject || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 4 && !FR_STOPWORDS.has(w));
}

function rawKeywordsOf(raw) {
  const kw = raw.keyword != null ? raw.keyword : raw.keywords;
  if (kw == null) return null;
  const list = Array.isArray(kw) ? kw : String(kw).split(',');
  return list.map(s => String(s).trim()).filter(Boolean);
}

let DOC_KEYWORDS = {};       // id -> [mots-clés affichables]
let KEYWORD_LIST = [];       // [{ key, label, count }] triés par fréquence décroissante
let checkedKeywords = new Set(); // clés cochées dans le filtre (tout coché par défaut)

function buildKeywordIndex() {
  const result = {};
  const fallbackDocs = [];

  DOCUMENTS.forEach(raw => {
    const explicit = rawKeywordsOf(raw);
    if (explicit && explicit.length) result[raw.id] = explicit;
    else fallbackDocs.push(raw);
  });

  // Vocabulaire commun déduit des objets (subject) des documents qui n'ont
  // pas de champ mots-clés explicite : mots partagés par au moins 2 courriers.
  const freq = new Map();
  fallbackDocs.forEach(raw => {
    new Set(tokenizeSubject(raw.subject)).forEach(t => freq.set(t, (freq.get(t) || 0) + 1));
  });
  const common = new Set([...freq.entries()].filter(([, c]) => c >= 2).map(([t]) => t));

  fallbackDocs.forEach(raw => {
    const tokens = tokenizeSubject(raw.subject);
    let kws = tokens.filter(t => common.has(t));
    if (!kws.length) kws = [...new Set(tokens)].sort((a, b) => b.length - a.length).slice(0, 4);
    result[raw.id] = [...new Set(kws)];
  });

  const counts = new Map(); // clé normalisée -> { label affiché, nb de documents }
  Object.values(result).forEach(list => {
    new Set(list.map(k => k.toLowerCase())).forEach(keyLower => {
      const label = list.find(k => k.toLowerCase() === keyLower);
      const cur = counts.get(keyLower) || { label, count: 0 };
      cur.count += 1;
      counts.set(keyLower, cur);
    });
  });

  DOC_KEYWORDS = result;
  // Pas de troncature : toutes les clés doivent avoir une case à cocher,
  // sinon un document dont aucun mot-clé ne serait affiché disparaîtrait
  // silencieusement même quand "tout" est coché.
  KEYWORD_LIST = [...counts.entries()]
    .map(([key, v]) => ({ key, label: v.label, count: v.count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  checkedKeywords = new Set(KEYWORD_LIST.map(k => k.key)); // tout coché par défaut
}

function docKeywordsLower(id) {
  return (DOC_KEYWORDS[id] || []).map(k => k.toLowerCase());
}

// Liste déroulante à cases à cocher (tout coché par défaut, avec
// tout sélectionner / tout désélectionner). Construite une seule fois : les
// cases elles-mêmes gèrent leur propre état, seule la liste des courriers
// est re-rendue à chaque changement.
function renderKeywordFilters() {
  const wrap = document.getElementById('keyword-filters');
  if (!wrap) return;
  if (!KEYWORD_LIST.length) { wrap.innerHTML = ''; return; }

  wrap.innerHTML = `
    <div class="kw-dropdown">
      <button type="button" class="kw-dropdown-toggle" id="kw-dropdown-toggle">
        <span>Mots-clés</span>
        <span class="kw-dropdown-count" id="kw-dropdown-count"></span>
        <span class="kw-dropdown-caret">▾</span>
      </button>
      <div class="kw-dropdown-panel" id="kw-dropdown-panel">
        <div class="kw-dropdown-actions">
          <button type="button" id="kw-select-all">Tout sélectionner</button>
          <button type="button" id="kw-select-none">Tout désélectionner</button>
        </div>
        <div class="kw-dropdown-list">
          ${KEYWORD_LIST.map(k => `
            <label class="kw-option">
              <input type="checkbox" data-key="${escapeAttr(k.key)}" ${checkedKeywords.has(k.key) ? 'checked' : ''}>
              <span class="kw-option-label">${escapeHtml(k.label)}</span>
              <span class="kw-option-count">${k.count}</span>
            </label>`).join('')}
        </div>
      </div>
    </div>`;

  const toggle = document.getElementById('kw-dropdown-toggle');
  const panel = document.getElementById('kw-dropdown-panel');
  const countEl = document.getElementById('kw-dropdown-count');

  function updateCount() {
    countEl.textContent = `${checkedKeywords.size}/${KEYWORD_LIST.length}`;
  }
  updateCount();

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    panel.classList.toggle('open');
  });
  document.addEventListener('click', (e) => {
    if (!panel.contains(e.target) && e.target !== toggle) panel.classList.remove('open');
  });

  panel.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      const key = cb.dataset.key;
      if (cb.checked) checkedKeywords.add(key); else checkedKeywords.delete(key);
      updateCount();
      renderMailList();
    });
  });

  document.getElementById('kw-select-all').addEventListener('click', () => {
    checkedKeywords = new Set(KEYWORD_LIST.map(k => k.key));
    panel.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = true; });
    updateCount();
    renderMailList();
  });
  document.getElementById('kw-select-none').addEventListener('click', () => {
    checkedKeywords.clear();
    panel.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = false; });
    updateCount();
    renderMailList();
  });
}

// ---------------------------------------------------------------------------
// État d'affichage (non persistant)
// ---------------------------------------------------------------------------
let selectedId = null;
let lbZoom = 1;             // zoom du scan en grand (lightbox)
let pendingAction = null;   // 'classer' | 'poursuite' | 'reorientation' | 'reorientation_tribunal' | 'reorientation_service' | null
let selectedMotif = null;   // { code, label }
let selectedReorientationTarget = null; // magistrat/service sélectionné via @mention

// ---------------------------------------------------------------------------
// Rendu — liste des courriers
// ---------------------------------------------------------------------------
function renderMailList() {
  const q = (document.getElementById('search-input').value || '').toLowerCase().trim();
  const items = DOCUMENTS.map(raw => mergedDoc(raw.id))
    .filter(d => {
      if (q && !(d.name + ' ' + d.subject).toLowerCase().includes(q)) return false;
      const kws = docKeywordsLower(d.id);
      // Un document sans mot-clé indexé reste toujours visible (rien à cocher/décocher pour lui).
      if (kws.length && !kws.some(k => checkedKeywords.has(k))) return false;
      return true;
    })
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
    const nComments = getComments(d.id).length;
    const el = document.createElement('div');
    el.className = 'mail-item' + (d.id === selectedId ? ' selected' : '');
    el.addEventListener('click', () => selectDoc(d.id));
    el.innerHTML = `
      <div class="row1">
        <span class="sender">${escapeHtml(d.name || '(expéditeur inconnu)')}</span>
        <span class="date">${escapeHtml(d.date || '')}</span>
      </div>
      <div class="subject">${escapeHtml(d.subject || '')}</div>
      <div class="meta-row">${statusBadge(status)}${d.minor ? '<span class="badge badge-mineur">Mineur</span>' : ''}${nComments ? '<span class="badge badge-signale">Signalé</span>' : ''}</div>
    `;
    wrap.appendChild(el);
  });

  renderMiniStats();
}

function selectDoc(id) {
  selectedId = id;
  pendingAction = null;
  selectedMotif = null;
  selectedReorientationTarget = null;
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
  renderSignalementBox();
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
        ${fieldHtml(d, 'type', "Type d'atteinte / infraction")}
      </div>
      ${fieldHtml(d, 'subject', 'Objet', 'textarea')}
      ${fieldHtml(d, 'minor', 'Mineur impliqué (nom, ou vide si aucun)')}
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
// Rendu — panneau de décision (classement / poursuites / réorientation)
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
  if (pendingAction === 'reorientation') {
    box.innerHTML = reorientationChoiceHtml();
    wireReorientationChoice();
    return;
  }
  if (pendingAction === 'reorientation_tribunal') {
    box.innerHTML = reorientationTribunalFormHtml(rec);
    wireReorientationTribunalForm();
    return;
  }
  if (pendingAction === 'reorientation_service') {
    box.innerHTML = reorientationServiceFormHtml(rec);
    wireReorientationServiceForm();
    return;
  }

  if (status === 'nontraite') {
    box.innerHTML = `
      <div class="action-buttons-col">
        <button class="btn btn-classer" id="btn-classer">Classer sans suite</button>
        <button class="btn btn-poursuite" id="btn-poursuite">Engager des poursuites</button>
        <button class="btn btn-reorientation" id="btn-reorientation">Réorientation</button>
      </div>`;
    document.getElementById('btn-classer').addEventListener('click', () => {
      pendingAction = 'classer'; selectedMotif = null; renderReaderDecision();
    });
    document.getElementById('btn-poursuite').addEventListener('click', () => {
      pendingAction = 'poursuite'; renderReaderDecision();
    });
    document.getElementById('btn-reorientation').addEventListener('click', () => {
      pendingAction = 'reorientation'; selectedReorientationTarget = null; renderReaderDecision();
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
      } else if (rec.status === 'reoriente') {
        if (rec.reorientationType === 'tribunal_incompetent') {
          pendingAction = 'reorientation_tribunal';
        } else {
          pendingAction = 'reorientation_service';
          selectedReorientationTarget = rec.reorientationTarget || null;
        }
      } else {
        pendingAction = 'poursuite';
      }
      renderReaderDecision();
    });
  }
}

function decisionSummaryHtml(rec) {
  if (rec.status === 'reoriente') {
    if (rec.reorientationType === 'tribunal_incompetent') {
      return `
        <h3>Décision</h3>
        <div class="decision-summary">
          <div class="label">Statut</div><div class="value">Réorienté — tribunal non compétent</div>
          <div class="label">Explication</div><div class="note">${escapeHtml(rec.reorientationMotif || '—')}</div>
          <div class="label" style="margin-top:8px;">Décidé le</div><div class="value">${escapeHtml(formatTs(rec.decidedAt))}</div>
        </div>
        <div class="decision-actions">
          <button class="btn btn-secondary" id="btn-edit-decision">Modifier la décision</button>
        </div>`;
    }
    const dest = rec.reorientationTarget ? rec.reorientationTarget.name : '—';
    const destContact = rec.reorientationTarget ? `${rec.reorientationTarget.role} · ${rec.reorientationTarget.email}` : '';
    return `
      <h3>Décision</h3>
      <div class="decision-summary">
        <div class="label">Statut</div><div class="value">Réorienté — autre service / magistrat</div>
        <div class="label">Destinataire</div><div class="value">${escapeHtml(dest)}</div>
        ${destContact ? `<div class="label">Contact</div><div class="value">${escapeHtml(destContact)}</div>` : ''}
        ${rec.reorientationNote ? `<div class="label">Note</div><div class="note">${escapeHtml(rec.reorientationNote)}</div>` : ''}
        <div class="label" style="margin-top:8px;">Décidé le</div><div class="value">${escapeHtml(formatTs(rec.decidedAt))}</div>
      </div>
      <div class="decision-actions">
        <button class="btn btn-secondary" id="btn-edit-decision">Modifier la décision</button>
      </div>`;
  }
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
      renderKpis();
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
        <textarea id="poursuite-note" placeholder="Instructions pour le BOP / le service enquêteur…">${escapeHtml(noteVal)}</textarea>
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
    renderKpis();
    toast('Poursuites engagées, courrier mis à jour.');
  });
}

// ---------------------------------------------------------------------------
// Réorientation : soit tribunal non compétent (motif libre, pas de document
// généré), soit réorientation vers un autre service/magistrat du répertoire
// (mention @nom, magistrats nommés + services génériques par email).
// ---------------------------------------------------------------------------
function reorientationChoiceHtml() {
  return `
    <h3>Réorientation</h3>
    <div class="decision-panel">
      <div class="reorientation-choice">
        <button type="button" class="choice-card" id="choice-tribunal">
          <div class="choice-title">Tribunal non compétent</div>
          <div class="choice-desc">Le tribunal saisi n'est pas compétent pour ce courrier. Explication libre, sans document généré.</div>
        </button>
        <button type="button" class="choice-card" id="choice-service">
          <div class="choice-title">Autre service / magistrat</div>
          <div class="choice-desc">Taguer un magistrat nommé ou un service (adresse générique) du répertoire pour lui transmettre le dossier.</div>
        </button>
      </div>
      <div class="decision-actions">
        <button class="btn btn-secondary" id="btn-cancel-reorientation">Annuler</button>
      </div>
    </div>`;
}

function wireReorientationChoice() {
  document.getElementById('choice-tribunal').addEventListener('click', () => {
    pendingAction = 'reorientation_tribunal'; renderReaderDecision();
  });
  document.getElementById('choice-service').addEventListener('click', () => {
    pendingAction = 'reorientation_service'; selectedReorientationTarget = null; renderReaderDecision();
  });
  document.getElementById('btn-cancel-reorientation').addEventListener('click', () => {
    pendingAction = null; renderReaderDecision();
  });
}

function reorientationTribunalFormHtml(rec) {
  const motifVal = rec.status === 'reoriente' && rec.reorientationType === 'tribunal_incompetent' ? (rec.reorientationMotif || '') : '';
  return `
    <h3>Réorientation — tribunal non compétent</h3>
    <div class="decision-panel">
      <div class="field">
        <label>Explication (obligatoire)</label>
        <textarea id="reorientation-tribunal-motif" placeholder="Pourquoi ce tribunal n'est-il pas compétent, vers quelle juridiction le dossier doit-il être réorienté…">${escapeHtml(motifVal)}</textarea>
      </div>
      <div class="decision-actions">
        <button class="btn btn-primary" id="btn-confirm-reorientation-tribunal">Confirmer la réorientation</button>
        <button class="btn btn-secondary" id="btn-back-reorientation">Retour</button>
      </div>
    </div>`;
}

function wireReorientationTribunalForm() {
  document.getElementById('btn-back-reorientation').addEventListener('click', () => {
    pendingAction = 'reorientation'; renderReaderDecision();
  });
  document.getElementById('btn-confirm-reorientation-tribunal').addEventListener('click', () => {
    const motif = document.getElementById('reorientation-tribunal-motif').value.trim();
    if (!motif) { toast('Merci de préciser le motif d’incompétence.'); return; }
    recordDecision(selectedId, {
      status: 'reoriente', reorientationType: 'tribunal_incompetent', reorientationMotif: motif, decidedAt: Date.now(),
    });
    pendingAction = null;
    renderMailList();
    renderReaderFields();
    renderDbTable();
    renderKpis();
    toast('Courrier réorienté (tribunal non compétent).');
  });
}

function reorientationServiceFormHtml(rec) {
  let initialValue = '';
  if (selectedReorientationTarget) initialValue = '@' + selectedReorientationTarget.name;
  const noteVal = rec.status === 'reoriente' && rec.reorientationType === 'service' ? (rec.reorientationNote || '') : '';
  return `
    <h3>Réorientation — autre service / magistrat</h3>
    <div class="decision-panel">
      <div class="field mention-field">
        <label>Destinataire</label>
        <input type="text" id="reorientation-input" autocomplete="off"
          placeholder="@ nom du magistrat ou du service…" value="${escapeAttr(initialValue)}">
        <div class="mention-suggestions" id="reorientation-suggestions"></div>
        <div class="mention-hint">Tapez « @ » suivi d'un nom pour rechercher un magistrat ou un service
          (adresse générique) dans le répertoire.</div>
      </div>
      <div class="field">
        <label>Note à l'attention du destinataire (facultatif)</label>
        <textarea id="reorientation-note" placeholder="Motif de la réorientation, éléments utiles…">${escapeHtml(noteVal)}</textarea>
      </div>
      <div class="decision-actions">
        <button class="btn btn-primary" id="btn-confirm-reorientation-service">Confirmer la réorientation</button>
        <button class="btn btn-secondary" id="btn-back-reorientation">Retour</button>
      </div>
    </div>`;
}

function reorientationMentionSuggestionsHtml(query) {
  const q = query.trim().toLowerCase();
  const matches = REORIENTATION_TARGETS.filter(m =>
    m.name.toLowerCase().includes(q) || (m.email || '').toLowerCase().includes(q)
  ).slice(0, 8);
  if (!matches.length) {
    return `<div class="mention-empty">Aucun résultat dans le répertoire.</div>`;
  }
  return matches.map(m => `
    <div class="mention-item" data-id="${m.id}">
      <span class="mention-name">${escapeHtml(m.name)}${m.kind === 'service' ? ' <span class="mention-kind">service</span>' : ''}</span>
      <span class="mention-role">${escapeHtml(m.role)} · ${escapeHtml(m.email)}</span>
    </div>`).join('');
}

function wireReorientationServiceForm() {
  const input = document.getElementById('reorientation-input');
  const suggestions = document.getElementById('reorientation-suggestions');

  function closeSuggestions() {
    suggestions.classList.remove('open');
    suggestions.innerHTML = '';
  }

  function openSuggestionsFor(query) {
    suggestions.innerHTML = reorientationMentionSuggestionsHtml(query);
    suggestions.classList.add('open');
    suggestions.querySelectorAll('.mention-item').forEach(el => {
      el.addEventListener('click', () => {
        const m = REORIENTATION_TARGETS.find(x => x.id === el.dataset.id);
        selectedReorientationTarget = m;
        input.value = '@' + m.name;
        closeSuggestions();
        input.focus();
      });
    });
  }

  input.addEventListener('input', () => {
    const val = input.value;
    const at = val.lastIndexOf('@');
    if (val !== ('@' + (selectedReorientationTarget && selectedReorientationTarget.name || ''))) {
      selectedReorientationTarget = null;
    }
    if (at === -1) { closeSuggestions(); return; }
    openSuggestionsFor(val.slice(at + 1));
  });
  input.addEventListener('focus', () => {
    if (input.value.includes('@')) openSuggestionsFor(input.value.slice(input.value.lastIndexOf('@') + 1));
  });
  document.addEventListener('click', (e) => {
    if (!suggestions.contains(e.target) && e.target !== input) closeSuggestions();
  }, { once: true });

  document.getElementById('btn-back-reorientation').addEventListener('click', () => {
    pendingAction = 'reorientation'; selectedReorientationTarget = null; renderReaderDecision();
  });
  document.getElementById('btn-confirm-reorientation-service').addEventListener('click', () => {
    const val = input.value.trim();
    const reorientationNote = document.getElementById('reorientation-note').value;
    if (!val || !selectedReorientationTarget || ('@' + selectedReorientationTarget.name) !== val) {
      toast('Sélectionnez un magistrat ou un service dans la liste.');
      return;
    }
    const target = selectedReorientationTarget;
    recordDecision(selectedId, {
      status: 'reoriente', reorientationType: 'service', reorientationTarget: target, reorientationNote, decidedAt: Date.now(),
    });
    pendingAction = null;
    selectedReorientationTarget = null;
    renderMailList();
    renderReaderFields();
    renderDbTable();
    renderKpis();
    toast(`Courrier réorienté vers ${target.name}.`);
  });
}

// ---------------------------------------------------------------------------
// Signalement au BOP — indépendant des 3 décisions, toujours
// disponible, n'affecte pas le statut traité/non traité du courrier.
// ---------------------------------------------------------------------------
function renderSignalementBox() {
  const box = document.getElementById('signalement-box');
  if (!box || !selectedId) return;
  const id = selectedId;
  const comments = getComments(id);
  const history = comments.length
    ? `<div class="signalement-history">${comments.slice().reverse().map(c => `
        <div class="signalement-item">
          <div class="signalement-text">${escapeHtml(c.text)}</div>
          <div class="signalement-ts">${escapeHtml(formatTs(c.ts))}</div>
        </div>`).join('')}</div>`
    : '';

  box.innerHTML = `
    <details class="signalement-panel">
      <summary>📎 Signaler un problème au BOP${comments.length ? ` <span class="signalement-badge-count">${comments.length}</span>` : ''}</summary>
      <div class="signalement-body">
        <p class="signalement-hint">Ex. numérisation illisible, pièce manquante, dossier probablement mal orienté… Message local à cette démo (aucun envoi réel), qui simule une remontée au BOP.</p>
        <textarea id="signalement-input" placeholder="Décrire le problème…"></textarea>
        <button class="btn btn-secondary btn-block" id="btn-send-signalement">Envoyer au BOP</button>
        ${history}
      </div>
    </details>`;

  document.getElementById('btn-send-signalement').addEventListener('click', () => {
    const input = document.getElementById('signalement-input');
    const text = input.value.trim();
    if (!text) { toast('Écrivez un message avant de l’envoyer.'); return; }
    addSignalement(id, text);
    toast("Signalement envoyé au BOP.");
    renderSignalementBox();
    renderMailList();
    renderDbTable();
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
    const nComments = getComments(d.id).length;
    let orientation = '—';
    if (status === 'classe') orientation = `${rec.motifCode} — ${rec.motifLabel}`;
    else if (status === 'poursuites') orientation = rec.poursuiteType || '—';
    else if (status === 'reoriente') {
      orientation = rec.reorientationType === 'tribunal_incompetent'
        ? 'Tribunal non compétent'
        : (rec.reorientationTarget ? `→ ${rec.reorientationTarget.name}` : '→ (destinataire non renseigné)');
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(d.name || '—')}</td>
      <td>${escapeHtml(d.subject || '—')}</td>
      <td>${escapeHtml(d.date || '—')}</td>
      <td>${escapeHtml(typeLabel(d.type))}</td>
      <td>${d.minor ? escapeHtml(d.minor) : 'Non'}</td>
      <td>${statusBadge(status)}${nComments ? ' <span class="badge badge-signale">Signalé</span>' : ''}</td>
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
    reoriente: all.filter(s => s === 'reoriente').length,
  };
  el.innerHTML = `
    <div class="stat"><div class="num">${counts.nontraite}</div><div class="lbl">Non traités</div></div>
    <div class="stat"><div class="num">${counts.classe}</div><div class="lbl">Classés sans suite</div></div>
    <div class="stat"><div class="num">${counts.poursuites}</div><div class="lbl">Poursuites engagées</div></div>
    <div class="stat"><div class="num">${counts.reoriente}</div><div class="lbl">Réorientés</div></div>
  `;
}

// ---------------------------------------------------------------------------
// KPI magistrat (onglet base de données) — agrégés sur l'ensemble des
// documents du prototype. Le délai moyen de traitement s'appuie sur le champ
// mocké "digitized_at" des templates ; à défaut de décision enregistrée, une
// valeur d'exemple est affichée (clairement signalée comme telle).
// ---------------------------------------------------------------------------
function renderKpis() {
  const el = document.getElementById('kpi-grid');
  if (!el) return;

  const total = DOCUMENTS.length;
  const statuses = DOCUMENTS.map(raw => getStatus(raw.id));
  const nTraite = statuses.filter(s => s !== 'nontraite').length;
  const nClasse = statuses.filter(s => s === 'classe').length;
  const nPoursuites = statuses.filter(s => s === 'poursuites').length;
  const nReoriente = statuses.filter(s => s === 'reoriente').length;
  const pct = (n, d) => d ? Math.round((n / d) * 100) : 0;

  const delays = [];
  DOCUMENTS.forEach(raw => {
    const rec = STATE.docs[raw.id];
    if (rec && rec.decidedAt && raw.digitized_at) {
      const dig = new Date(raw.digitized_at).getTime();
      if (!isNaN(dig) && rec.decidedAt > dig) delays.push((rec.decidedAt - dig) / 86400000);
    }
  });
  let delayLabel, delayNote;
  if (delays.length) {
    const avg = delays.reduce((a, b) => a + b, 0) / delays.length;
    delayLabel = avg.toFixed(1).replace('.', ',') + ' j';
    delayNote = `sur ${delays.length} dossier(s) réellement traité(s)`;
  } else {
    delayLabel = '3,4 j';
    delayNote = 'valeur d’exemple — aucun dossier traité pour l’instant';
  }

  el.innerHTML = `
    <div class="kpi-tile">
      <div class="kpi-value">${pct(nTraite, total)}%</div>
      <div class="kpi-label">Dossiers traités</div>
      <div class="kpi-sub">${nTraite} / ${total} dossier(s)</div>
    </div>
    <div class="kpi-tile">
      <div class="kpi-value">${pct(nClasse, nTraite)}%</div>
      <div class="kpi-label">Classés sans suite</div>
      <div class="kpi-sub">parmi les dossiers traités</div>
    </div>
    <div class="kpi-tile">
      <div class="kpi-value">${pct(nPoursuites, nTraite)}%</div>
      <div class="kpi-label">Poursuites engagées</div>
      <div class="kpi-sub">parmi les dossiers traités</div>
    </div>
    <div class="kpi-tile">
      <div class="kpi-value">${pct(nReoriente, nTraite)}%</div>
      <div class="kpi-label">Réorientés</div>
      <div class="kpi-sub">parmi les dossiers traités</div>
    </div>
    <div class="kpi-tile">
      <div class="kpi-value">${delayLabel}</div>
      <div class="kpi-label">Délai moyen après numérisation</div>
      <div class="kpi-sub">${delayNote}</div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Onglets
// ---------------------------------------------------------------------------
function switchView(view) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  document.getElementById('view-mail').classList.toggle('active', view === 'mail');
  document.getElementById('view-db').classList.toggle('active', view === 'db');
  if (view === 'db') { renderDbTable(); renderKpis(); }
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
    document.getElementById('mail-items').innerHTML = '<div style="padding:16px;color:#888;font-size:13px;">Aucun document trouvé. Lancez <code>python3 generate_data.py</code> dans le dossier du projet.</div>';
    return;
  }
  buildKeywordIndex();
  renderKeywordFilters();
  initStaticListeners();
  renderMailList();
  renderDbTable();
  renderKpis();
}

init();
