# Vid-o-TikTok 🎬

Une application web qui génère des **vidéos TikTok verticales (1080×1920, 9:16)** directement dans le navigateur. Elle ne demande ni serveur, ni compte, ni installation.

## Démarrer

Ouvre `index.html` dans Chrome, Edge ou Firefox. Tu peux aussi lancer un petit serveur local :

```bash
python3 -m http.server 8000
# puis ouvre http://localhost:8000
```

## Fonctionnalités

- **Générateur rapide** : colle un script (une idée par ligne), choisis un modèle et clique sur « Générer » :
  - Texte libre (chaque ligne devient une scène)
  - Top / Classement avec compte à rebours (N°5 → N°1)
  - Le savais-tu ? (effet machine à écrire)
  - Citation
  - Storytime (sous-titres mot par mot, mot courant surligné)
  - Scène finale « Abonne-toi » en option
- **Éditeur de scènes** : texte, emoji, durée, animation (pop, fondu, zoom, glissé, machine à écrire, mot par mot), position, style du texte (encadré, contour, ombre), taille et couleurs.
- **Arrière-plans** : dégradé animé, couleur unie, **ta propre image** (avec effet Ken Burns) ou **ta propre vidéo**.
- **Musique** : importe un fichier audio, règle le volume ; un fondu de sortie est appliqué automatiquement.
- **Habillage** : pseudo `@moncompte`, barre de progression, couleur d'accent, police, transitions.
- **Export** : en MP4 si le navigateur le permet (Chrome/Edge récents), sinon en WebM. Le bouton « Capture PNG » sert à faire une miniature.
- **Projets** : sauvegarde automatique dans le navigateur, et export/import en `.json`. Les images, vidéos et musiques ne sont pas enregistrées : il faut les ré-importer.

## Remarques

- L'export se fait **en temps réel** : une vidéo de 20 s prend 20 s à enregistrer. Garde l'onglet visible pendant ce temps.
- Si tu obtiens un `.webm`, ou si TikTok refuse le fichier, convertis-le avec ffmpeg :

  ```bash
  ffmpeg -i video.webm -c:v libx264 -pix_fmt yuv420p -c:a aac -movflags +faststart video.mp4
  ```

- Raccourci : **Espace** lance ou met en pause l'aperçu.

## Structure

| Fichier      | Rôle                                                       |
|--------------|------------------------------------------------------------|
| `index.html` | Interface (scènes, aperçu, générateur, réglages)           |
| `style.css`  | Thème sombre, mise en page responsive                      |
| `app.js`     | Moteur de rendu Canvas, animations, générateur, export     |
