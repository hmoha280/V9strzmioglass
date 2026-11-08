# Stremio Glass — correctif lecteur 4.3.5 (candidate de test)

## Contenu

Cette archive est construite à partir de la version 4.3.3 fournie par l’utilisateur, avec les corrections ciblées du lecteur 4.3.4. Les fichiers sont à la racine de l’archive.

## Correctifs du lecteur

- Attend l’événement `ready` (ou le callback `client.add`) avant de sélectionner un fichier. Cela garantit que les métadonnées ET le stockage torrent sont prêts ; l’événement `metadata` seul peut être trop précoce.
- Corrige le chemin du script Service Worker WebTorrent : `dist/sw.min.js` (le fichier n’est pas à la racine du paquet npm).
- Charge WebTorrent via l’URL de module du tutoriel officiel, puis tente un second CDN si nécessaire.
- Affiche des erreurs distinctes si le CDN, WebRTC, le Service Worker ou le serveur vidéo échoue.
- Utilise `file.streamTo(video)`, la méthode de lecture navigateur documentée par WebTorrent, après création du serveur HTTP adossé au Service Worker.
- Conserve les diagnostics de chargement, les erreurs média, la progression, la vitesse, les pairs et l’estimation restante.
- Garde les commandes Lecture/Pause et le bouton de plein écran iOS/Safari.
- Versionne le cache Service Worker en `stremio-glass-v4.3.4`.

## Installation

Faire une sauvegarde du dépôt avant déploiement. Remplacer à la racine les fichiers de l’archive (`index.html`, `app.js`, `sw.js`, `manifest.webmanifest`, `icon-192.png`, `icon-512.png` et `README-FR.md`).

## Limites de validation

La syntaxe JavaScript et l’intégrité de l’archive peuvent être vérifiées ici, mais cette version n’a pas été exécutée sur un iPad physique ni testée avec un torrent réel. Il serait trompeur de garantir à 100 % la lecture avant cet essai.

WebTorrent dans un navigateur dépend de WebRTC et ne se connecte qu’aux pairs compatibles WebTorrent/WebRTC. Les codecs et conteneurs doivent aussi être pris en charge par Safari. Les formats MP4/MOV/WebM ne garantissent pas à eux seuls la compatibilité du codec audio/vidéo.


### Correctifs 4.3.4
- Le lecteur valide les identifiants Torrentio : hash v1 hexadécimal ou base32, ou magnet v1 existant.
- Les hashes v2 sont signalés clairement au lieu d'être convertis à tort en magnet btih.
- Les trackers WebRTC sont transmis via les options `announce` de WebTorrent.
- Le bouton plein écran vérifie que Safari a reçu les métadonnées vidéo avant d'appeler l'API iOS.
- Test statique uniquement : le fonctionnement réel dépend toujours des pairs WebRTC disponibles et doit être vérifié sur iPad.


## Correctifs 4.3.5 — P2P
- Construit un magnet v1 complet avec les trackers WebRTC dans les paramètres `tr`, au lieu de compter uniquement sur l’option `announce` de `client.add`.
- Prend aussi en charge un lien magnet reçu dans `stream.url`, en plus de `stream.infoHash`.
- Accepte les trackers WebSocket déclarés dans `sources` avec ou sans le préfixe `tracker:` et ajoute trois trackers WebTorrent WebSocket connus.
- Utilise explicitement le magnet complet dans `client.add`, conserve la sélection `fileIdx` et affiche les limites WebRTC dans le message d’attente.
- Synchronise le fichier `app.js` avec le script réellement exécuté dans `index.html`.


## Version 4.3.7
- Synchronisation du code réellement exécuté dans `index.html` avec `app.js` : le correctif d’attente des événements média de 4.3.6 est maintenant bien présent dans la page publiée.
- Nettoyage du lecteur avant destruction du torrent et du client WebTorrent.
- Arrêt automatique et libération des ressources temporaires à la fin de la vidéo.
- Rappel dans l’interface : les données torrent sont temporaires pendant la lecture ; l’application ne propose pas de téléchargement hors ligne.
- Cache Service Worker renouvelé en 4.3.7.

**Limite importante :** le stockage temporaire dépend du moteur WebTorrent et de Safari. Cette version n’a pas été testée sur un iPad physique ni avec un torrent réel ; elle ne peut donc pas être annoncée comme garantie.


## Version 4.3.8
- Corrige la construction des liens magnet : le champ `xt=urn:btih:` est conservé avec ses deux-points littéraux, sans sérialisation URL qui peut rendre certains magnets illisibles par le parseur WebTorrent.
- Accepte les variantes de liens `magnet:` avec paramètres encodés et normalise les hashes v1 hexadécimaux ou base32.
- Conserve uniquement les trackers WebSocket (`ws`/`wss`) utilisables dans le navigateur et ajoute les trackers WebRTC par défaut.
- Ajoute un message de diagnostic si WebTorrent refuse le magnet au moment de l’ajout.
- Cache Service Worker renouvelé en 4.3.8.
- Vérifications statiques uniquement : aucun test réel sur iPad ni sur une source Torrentio n’a été effectué.
