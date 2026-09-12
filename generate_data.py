import json, base64, os, re

BASE = os.path.dirname(os.path.abspath(__file__))
IMAGES_DIR = os.path.join(BASE, 'images')
TEMPLATES_DIR = os.path.join(BASE, 'templates')

# Appariement automatique : chaque extraction JSON (templates/<id>.json ou
# templates/<id>) est associée au scan images/<id>.<ext> qui porte le même nom
# de base (sans extension). Ça évite d'entretenir à la main une liste PAIRS
# chaque fois qu'un fichier est ajouté / renommé dans templates/ ou images/.
# Un template sans scan correspondant (ou l'inverse) est simplement ignoré,
# avec un avertissement affiché en fin d'exécution.

def strip_ext(fname):
    base = os.path.basename(fname)
    root, _ext = os.path.splitext(base)
    return root

def mime_for(fn):
    fn = fn.lower()
    if fn.endswith('.png'):
        return 'image/png'
    if fn.endswith('.jpg') or fn.endswith('.jpeg'):
        return 'image/jpeg'
    if fn.endswith('.webp'):
        return 'image/webp'
    return 'application/octet-stream'

images_by_stem = {}
for fname in sorted(os.listdir(IMAGES_DIR)):
    fpath = os.path.join(IMAGES_DIR, fname)
    if not os.path.isfile(fpath):
        continue
    stem = strip_ext(fname)
    images_by_stem.setdefault(stem, []).append(fname)

template_files = sorted(
    f for f in os.listdir(TEMPLATES_DIR) if os.path.isfile(os.path.join(TEMPLATES_DIR, f))
)

docs = []
unmatched_templates = []
used_stems = set()

for tpl_name in template_files:
    stem = strip_ext(tpl_name)
    candidates = images_by_stem.get(stem)
    if not candidates:
        unmatched_templates.append(tpl_name)
        continue
    img_name = sorted(candidates)[0]  # si plusieurs scans pour un même id, on prend le premier (ordre alpha)
    used_stems.add(stem)

    tpl_path = os.path.join(TEMPLATES_DIR, tpl_name)
    img_path = os.path.join(IMAGES_DIR, img_name)
    with open(tpl_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    with open(img_path, 'rb') as f:
        b64 = base64.b64encode(f.read()).decode('ascii')
    doc_id = re.sub(r'\.json$', '', tpl_name)
    docs.append({
        "id": doc_id,
        "sourceFile": tpl_name,
        "imageFile": img_name,
        "imageMime": mime_for(img_name),
        "imageData": b64,
        **data
    })

unmatched_images = [
    fname for stem, names in images_by_stem.items() if stem not in used_stems for fname in names
]

out_path = os.path.join(BASE, 'data.js')
with open(out_path, 'w', encoding='utf-8') as f:
    f.write("// Fichier genere automatiquement par generate_data.py -- ne pas editer a la main.\n")
    f.write("// Relancer `python3 generate_data.py` apres ajout/renommage de scans dans images/\n")
    f.write("// et d'extractions dans templates/ (appariement automatique par nom de fichier).\n")
    f.write("const DOCUMENTS = ")
    json.dump(docs, f, ensure_ascii=False, indent=2)
    f.write(";\n")

print("OK:", len(docs), "documents ->", out_path)
if unmatched_templates:
    print("ATTENTION - templates sans scan associe (ignores):", unmatched_templates)
if unmatched_images:
    print("ATTENTION - scans sans template associe (ignores):", unmatched_images)
