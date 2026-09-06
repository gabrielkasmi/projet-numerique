# Boîte du magistrat — courriers

Prototype front-only (aucun serveur, aucune base de données partagée) de traitement
des courriers reçus par un bureau d'ordre : lecture des scans, extraction OCR,
classement et décisions de poursuite.

## Structure du dépôt

```
index.html          Page principale de l'application
style.css            Styles
app.js                Logique de l'application (état conservé dans le localStorage du navigateur)
auth.js               Gate d'accès par mot de passe (voir "Accès" ci-dessous)
data.js               Données des courriers (généré, voir ci-dessous — ne pas éditer à la main)
generate_data.py       Script qui régénère data.js à partir de images/ et templates/
images/                Scans sources (non affichés directement : encodés dans data.js)
templates/             Extractions JSON associées à chaque scan
```

## Régénérer les données

Si de nouveaux scans sont ajoutés dans `images/` et de nouvelles extractions dans
`templates/`, mettre à jour la liste `PAIRS` dans `generate_data.py`, puis :

```bash
python3 generate_data.py
```

Cela régénère `data.js` (courriers + images encodées en base64).

## Accès

La page est protégée par un simple mot de passe codé en dur dans `auth.js`
(friction, pas une vraie sécurité — le code source reste public sur GitHub Pages).

## Déploiement (GitHub Pages)

1. Créer un dépôt GitHub (public ou privé) et pousser ce dossier tel quel.
2. Dans les paramètres du dépôt → **Pages** → source = branche `main`, dossier `/ (root)`.
3. La page est ensuite disponible à `https://<utilisateur>.github.io/<repo>/`.
