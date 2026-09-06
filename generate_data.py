import json, base64, os, re

BASE = os.path.dirname(os.path.abspath(__file__))
IMAGES_DIR = os.path.join(BASE, 'images')
TEMPLATES_DIR = os.path.join(BASE, 'templates')

# Association manuelle image <-> extraction JSON, faite par lecture du contenu des
# scans (les noms de fichiers image ne correspondent pas aux noms de dossier).
# NB: la paire jean-dupont-2.json / Gemini_..._gklcjg... ne correspond pas
# vraiment sur le fond (le courrier scanné parle de dégradation de biens, le
# JSON parle de harcèlement scolaire) : il manque une image pour jean-dupont-2
# et il manque un JSON pour ce courrier "dégradation". A reconstituer plus tard.
PAIRS = [
    ("antoine-dubois.json", "Capture d’écran 2026-08-24 à 21.11.43.png"),
    ("jean-martin.json", "ChatGPT Image 23 août 2026, 17_20_23.png"),
    ("jean-dupont.json", "Gemini_Generated_Image_fatpkwfatpkwfatp.jpg"),
    ("marie-dubois", "Gemini_Generated_Image_nwipirnwipirnwip.jpg"),
    ("jean-dupont-2.json", "Gemini_Generated_Image_gklcjgklcjgklcjg.jpg"),
]

def mime_for(fn):
    fn = fn.lower()
    if fn.endswith('.png'):
        return 'image/png'
    if fn.endswith('.jpg') or fn.endswith('.jpeg'):
        return 'image/jpeg'
    return 'application/octet-stream'

docs = []
for tpl_name, img_name in PAIRS:
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

out_path = os.path.join(BASE, 'data.js')
with open(out_path, 'w', encoding='utf-8') as f:
    f.write("// Fichier genere automatiquement par generate_data.py -- ne pas editer a la main.\n")
    f.write("// Relancer `python3 generate_data.py` depuis mailbox-app/ apres ajout de nouveaux\n")
    f.write("// scans dans ../images et de nouvelles extractions dans ../templates.\n")
    f.write("const DOCUMENTS = ")
    json.dump(docs, f, ensure_ascii=False, indent=2)
    f.write(";\n")

print("OK:", len(docs), "documents ->", out_path)
