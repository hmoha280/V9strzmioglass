const CINEMETA='https://v3-cinemeta.strem.io/manifest.json';
const STORAGE_KEY='stremio-glass.addons.v4';
const DEFAULT_ADDON={id:'org.stremio.cinemeta',name:'Cinemeta',manifest:CINEMETA,base:'https://v3-cinemeta.strem.io',version:'builtin',enabled:true,builtin:true,resources:['catalog','meta'],types:['movie','series'],catalogs:[{type:'movie',id:'top',name:'Films populaires'},{type:'series',id:'top',name:'Séries populaires'}]};
const DEFAULT_WEB_TRACKERS=['wss://tracker.openwebtorrent.com','wss://tracker.btorrent.xyz','wss://tracker.fastcast.nz'];
let addons=loadAddons(), currentView='home', searchTimer=null, torrentClient=null, activeTorrent=null, activeVideoUrl=null, detailMeta=null, torrentStatsTimer=null;
const $=id=>document.getElementById(id);
function loadAddons(){try{const data=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');return [structuredClone(DEFAULT_ADDON),...data.filter(a=>a&&a.manifest!==CINEMETA).map(a=>({...a,enabled:a.enabled!==false}))]}catch{return [structuredClone(DEFAULT_ADDON)]}}
function saveAddons(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(addons.filter(a=>!a.builtin)))}catch(e){console.warn('Local storage indisponible',e);setAddonMessage('Stockage local indisponible dans ce mode de navigation.')}}
function setAddonMessage(s){$('addonMessage').textContent=s}
function esc(v=''){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function safeUrl(v){try{const u=new URL(v,location.href);return ['https:','http:'].includes(u.protocol)?u.href:''}catch{return ''}}
function resourcesOf(manifest){return Array.isArray(manifest?.resources)?manifest.resources:[]}
function hasResource(addon,name,type,id){const res=resourcesOf(addon);return res.some(r=>{const n=typeof r==='string'?r:r?.name;if(n!==name)return false;if(typeof r==='string')return !type||!addon.types?.length||addon.types.includes(type);if(type&&Array.isArray(r.types)&&!r.types.includes(type))return false;const prefixes=r.idPrefixes||addon.idPrefixes;if(id&&Array.isArray(prefixes)&&prefixes.length&&!prefixes.some(p=>String(id).startsWith(p)))return false;return true})}
function endpoint(addon,resource,type,id,extra={}){const base=new URL(addon.base);const path=(base.pathname.replace(/\/$/,'')+'/'+resource+'/'+encodeURIComponent(type)+'/'+encodeURIComponent(id)+'.json').replace(/\/+/g,'/');base.pathname=path;for(const [k,v] of Object.entries(extra))if(v!==undefined&&v!==null&&v!=='')base.searchParams.set(k,String(v));return base.href}
async function fetchJSON(url,timeout=14000){const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),timeout);try{const r=await fetch(url,{headers:{Accept:'application/json'},signal:ctrl.signal,cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status);const data=await r.json();if(!data||typeof data!=='object')throw new Error('Réponse JSON invalide');return data}finally{clearTimeout(timer)}}
function showView(v){currentView=v;['home','search','addons','about'].forEach(x=>$(x+'View').classList.toggle('hidden',x!==v));document.querySelectorAll('.bottom button').forEach(b=>b.classList.toggle('active',b.dataset.view===v));if(v==='addons')renderAddons()}
function renderCard(item){const poster=safeUrl(item.poster||item.background||'');const title=item.name||item.title||'Sans titre';return `<article class="card" tabindex="0" role="button" data-id="${esc(item.id)}" data-type="${esc(item.type||'movie')}"><img class="poster" loading="lazy" src="${esc(poster)}" alt="Affiche de ${esc(title)}" onerror="this.style.opacity='.2'"><div class="card-title">${esc(title)}</div><div class="card-sub">${esc(item.year||'')}${item.imdbRating?` · <span class="rating">★ ${esc(item.imdbRating)}</span>`:''}</div></article>`}
function bindCards(container){container.querySelectorAll('.card').forEach(card=>{const open=()=>openMeta(card.dataset.type,card.dataset.id);card.addEventListener('click',open);card.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open()}})})}
function renderCards(container,items){container.innerHTML=items.length?items.map(renderCard).join(''):'<div class="empty">Aucun résultat disponible.</div>';bindCards(container)}
function addonCatalogs(addon,type){return (addon.catalogs||[]).filter(c=>c.type===type)}
function catalogTitle(c,addon){return c.name||addon.name+' · '+c.id}
async function loadHome(){const root=$('homeCatalogs');root.innerHTML='<div class="empty">Chargement des catalogues…</div>';const enabled=addons.filter(a=>a.enabled);const jobs=[];for(const a of enabled){for(const type of ['movie','series']){const catalogs=addonCatalogs(a,type);for(const c of catalogs.slice(0,3))jobs.push({addon:a,type,catalog:c})}}if(!jobs.length){root.innerHTML='<div class="empty">Aucun catalogue déclaré par les addons.</div>';return}root.innerHTML='';const results=await Promise.all(jobs.slice(0,12).map(async job=>{try{const data=await fetchJSON(endpoint(job.addon,'catalog',job.type,job.catalog.id,{skip:0}));return {...job,items:data.metas||[]}}catch(e){return {...job,error:e.message,items:[]}}}));for(const r of results){if(!r.items.length)continue;const section=document.createElement('section');section.className='section';section.innerHTML=`<div class="section-head"><h2>${esc(catalogTitle(r.catalog,r.addon))}</h2><span class="pill">${esc(r.addon.name)}</span><div class="grow"></div><button class="quiet small" data-more="1">Voir le catalogue</button></div><div class="cards"></div>`;renderCards(section.querySelector('.cards'),r.items.slice(0,18));section.querySelector('[data-more]').onclick=()=>loadMoreCatalog(r.addon,r.type,r.catalog);root.append(section)}if(!root.children.length)root.innerHTML='<div class="empty">Les catalogues ne répondent pas. Vérifie ta connexion ou les réglages CORS des addons.</div>'}
async function loadMoreCatalog(addon,type,catalog){showView('search');$('searchCount').textContent=catalogTitle(catalog,addon);const box=$('searchResults');box.innerHTML='<div class="empty">Chargement…</div>';try{const data=await fetchJSON(endpoint(addon,'catalog',type,catalog.id,{skip:0}));renderCards(box,data.metas||[])}catch(e){box.innerHTML=`<div class="empty">Catalogue indisponible : ${esc(e.message)}</div>`}}
function supports(addon,resource,type,id){if(addon.builtin&&resource==='meta')return true;return hasResource(addon,resource,type,id)}
async function getMeta(type,id,fallback){const candidates=addons.filter(a=>a.enabled&&supports(a,'meta',type,id));for(const a of candidates){try{const d=await fetchJSON(endpoint(a,'meta',type,id));if(d.meta)return d.meta}catch(e){console.warn('Meta addon',a.name,e.message)}}return fallback||null}
function normalizeStream(s,a){return {...s,_addonName:a.name,_addonId:a.id}}
async function getStreams(type,videoId){const candidates=addons.filter(a=>a.enabled&&supports(a,'stream',type,videoId));const results=await Promise.all(candidates.map(async a=>{try{const d=await fetchJSON(endpoint(a,'stream',type,videoId));return (d.streams||[]).map(s=>normalizeStream(s,a))}catch(e){console.warn('Stream addon',a.name,e.message);return []}}));const seen=new Set();return results.flat().filter(s=>{const key=s.url||s.infoHash||s.ytId||JSON.stringify(s);if(seen.has(key))return false;seen.add(key);return true})}
async function getSubtitles(type,videoId){const candidates=addons.filter(a=>a.enabled&&supports(a,'subtitles',type,videoId));const lists=await Promise.all(candidates.map(async a=>{try{const d=await fetchJSON(endpoint(a,'subtitles',type,videoId));return d.subtitles||[]}catch{return []}}));return lists.flat()}
function streamKind(s){if(s.infoHash||/^magnet:\?/i.test(String(s.url||'')))return 'torrent';if(s.url)return 'direct';if(s.ytId)return 'youtube';return 'unknown'}
function streamLabel(s,i){return s.name||s.title||s.behaviorHints?.filename||s._addonName||'Source '+(i+1)}
function formatBytes(bytes){const n=Number(bytes);if(!Number.isFinite(n)||n<=0)return '';const units=['o','Ko','Mo','Go','To'];let v=n,i=0;while(v>=1024&&i<units.length-1){v/=1024;i++}return (v>=10?v.toFixed(0):v.toFixed(1))+' '+units[i]}
function streamText(s){return [s.name,s.title,s.description,s.behaviorHints?.filename,s._addonName].filter(Boolean).join(' ')}
function streamLanguages(s){const text=streamText(s);const flags=[...new Set((text.match(/[\u{1F1E6}-\u{1F1FF}]{2}/gu)||[]))];const map=[['french',['french','français','french audio','vff','vfq','vfi','vf']],['english',['english','anglais']],['german',['german','allemand']],['spanish',['spanish','espagnol']],['italian',['italian','italien']],['dutch',['dutch','néerlandais']],['portuguese',['portuguese','portugais']],['japanese',['japanese','japonais']],['korean',['korean','coréen']],['russian',['russian','russe']]];const icons={french:'🇫🇷',english:'🇬🇧',german:'🇩🇪',spanish:'🇪🇸',italian:'🇮🇹',dutch:'🇳🇱',portuguese:'🇵🇹',japanese:'🇯🇵',korean:'🇰🇷',russian:'🇷🇺'};for(const [key,words] of map)if(words.some(w=>new RegExp('(^|[^a-z])'+w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'([^a-z]|$)','i').test(text)))flags.push(icons[key]);return [...new Set(flags)].slice(0,6)}
function streamSize(s){return s.videoSize||s.behaviorHints?.videoSize||(()=>{const t=streamText(s);const m=t.match(/(?:💾|size[: ]*)?([0-9]+(?:[.,][0-9]+)?)\s*(TB|GB|GIB|MB|MIB|KB|KIB)\b/i);if(!m)return 0;const val=parseFloat(m[1].replace(',','.'));const unit=m[2].toUpperCase();const pow=/^(TB|GB|MB|KB)$/.test(unit)?1000:1024;const exp=unit.startsWith('T')?4:unit.startsWith('G')?3:unit.startsWith('M')?2:1;return val*Math.pow(pow,exp)})()}
function streamQuality(s){const text=streamText(s);return (text.match(/2160p|4k|1080p|720p|576p|480p|360p|HDR10\+?|HDR|DV|Dolby Vision/i)||[])[0]||''}
function streamBadges(s,kind){const flags=streamLanguages(s);const size=formatBytes(streamSize(s));const quality=streamQuality(s);const seed=s.seeders??s.peers??null;return `<div class="stream-badges">${flags.map(f=>`<span class="stream-badge lang" title="Langue détectée">${f}</span>`).join('')}${quality?`<span class="stream-badge quality">${esc(quality.toUpperCase())}</span>`:''}${size?`<span class="stream-badge size">${esc(size)}</span>`:''}${seed!==null?`<span class="stream-badge">👥 ${esc(seed)}</span>`:''}<span class="stream-badge">${kind==='torrent'?'P2P / Torrent':kind==='direct'?'Direct':'Autre'}</span></div>`}
function closeModal(){stopPlayback();$('modal').classList.add('hidden')}
function stopPlayback(){if(torrentStatsTimer){clearInterval(torrentStatsTimer);torrentStatsTimer=null}const v=$('videoPlayer');if(v){v.pause();v.removeAttribute('src');v.querySelectorAll('track').forEach(t=>t.remove());v.load()}if(activeTorrent){try{activeTorrent.destroy()}catch(e){console.warn('Nettoyage torrent',e)}activeTorrent=null}if(torrentClient){try{torrentClient.destroy()}catch(e){console.warn('Nettoyage client torrent',e)}torrentClient=null}activeVideoUrl=null}
function showPlayer(){const p=$('playerArea');p.classList.remove('hidden');p.scrollIntoView({behavior:'smooth',block:'center'})}
function base32ToHex(value){const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits=0,buffer=0,out='';for(const ch of value.toUpperCase()){const n=alphabet.indexOf(ch);if(n<0)throw new Error('InfoHash base32 invalide.');buffer=(buffer<<5)|n;bits+=5;if(bits>=8){bits-=8;out+=((buffer>>bits)&255).toString(16).padStart(2,'0')}}return out}
function torrentInput(stream){
  const rawValue=String(stream.infoHash||stream.url||'').trim();
  if(!rawValue)throw new Error('Torrentio n’a fourni ni infoHash ni lien magnet.');
  const sourceTrackers=Array.isArray(stream.sources)?stream.sources.filter(x=>typeof x==='string').map(x=>x.startsWith('tracker:')?x.slice(8):x):[];
  const trackers=[...sourceTrackers,...DEFAULT_WEB_TRACKERS].filter((x,i,a)=>/^wss?:\/\//i.test(x)&&a.indexOf(x)===i);
  let hash=rawValue;
  let displayName=String(stream.behaviorHints?.filename||'').slice(0,180);
  if(/^magnet:/i.test(rawValue)){
    const question=rawValue.indexOf('?');
    if(question<0)throw new Error('Lien magnet Torrentio incomplet : paramètres absents.');
    const params=new URLSearchParams(rawValue.slice(question+1).replace(/&amp;/gi,'&'));
    const xt=params.getAll('xt').find(x=>/^urn:btih:/i.test(x));
    if(!xt){if(params.getAll('xt').some(x=>/^urn:btmh:/i.test(x)))throw new Error('Cette source utilise un hash BitTorrent v2 (btmh), non pris en charge par WebTorrent dans ce lecteur.');throw new Error('Le lien magnet ne contient pas de hash BitTorrent v1 (btih).');}
    hash=xt.replace(/^urn:btih:/i,'').trim();
    displayName=params.get('dn')||displayName;
    const existing=params.getAll('tr');
    trackers.unshift(...existing);
  }
  hash=String(hash).replace(/^urn:btih:/i,'').trim();
  if(/^[a-z2-7]{32}$/i.test(hash))hash=base32ToHex(hash);
  if(!/^[a-f0-9]{40}$/i.test(hash)){
    if(/^[a-f0-9]{64}$/i.test(hash)||/^urn:btmh:/i.test(rawValue))throw new Error('Cette source utilise un hash BitTorrent v2 (btmh). Le moteur WebTorrent actuel attend un hash v1 (40 caractères).');
    throw new Error('Identifiant Torrentio invalide : hash v1 de 40 caractères hexadécimaux attendu.');
  }
  const uniqueTrackers=[...new Set(trackers.filter(x=>/^wss?:\/\//i.test(x)))];
  // Keep the mandatory xt value literal. Some URL serializers percent-encode
  // its colons; older magnet parsers used by WebTorrent can reject that form.
  let magnet='magnet:?xt=urn:btih:'+hash.toLowerCase();
  if(displayName)magnet+='&dn='+encodeURIComponent(displayName);
  for(const tracker of uniqueTrackers)magnet+='&tr='+encodeURIComponent(tracker);
  return {magnet,trackers:uniqueTrackers};
}
async function loadWebTorrent(){
  if(typeof window.WebTorrent==='function')return window.WebTorrent;
  if(!window.webTorrentModulePromise)window.webTorrentModulePromise=(async()=>{
    const urls=['https://esm.sh/webtorrent@3.0.21/dist/webtorrent.min.js','https://cdn.jsdelivr.net/npm/webtorrent@3.0.21/+esm'];
    let lastError;
    for(const url of urls){
      try{
        const mod=await import(url);
        const Constructor=mod.default||mod.WebTorrent||mod;
        if(typeof Constructor!=='function')throw new Error('Le module chargé ne fournit pas le constructeur WebTorrent.');
        return Constructor;
      }catch(error){lastError=error;console.warn('Chargement WebTorrent impossible depuis '+url,error)}
    }
    throw new Error('Impossible de charger WebTorrent depuis les deux CDN. Vérifie le réseau, le bloqueur de contenu ou les règles de confidentialité Safari. Détail : '+(lastError?.message||'erreur inconnue'));
  })();
  return window.webTorrentModulePromise;
}
function formatRate(bytes){return formatBytes(bytes||0)+'/s'}
function updateTorrentProgress(torrent,file){
  if(activeTorrent!==torrent)return;
  const pct=Math.max(0,Math.min(100,(file.progress||0)*100));
  const bar=$('torrentProgressBar'),label=$('torrentProgressLabel'),stats=$('torrentStats');
  if(bar)bar.style.width=pct.toFixed(1)+'%';
  if(label)label.textContent=pct.toFixed(1)+' %';
  if(stats){
    const downloaded=Number(file.downloaded||0),total=Number(file.length||0),speed=Number(torrent.downloadSpeed||0);
    const peers=Number(torrent.numPeers||0);
    const eta=speed>0&&total>downloaded?Math.ceil((total-downloaded)/speed):null;
    const etaText=eta===null?'—':eta<60?eta+' s':Math.floor(eta/60)+' min';
    stats.innerHTML=`<span>⬇ ${esc(formatRate(speed))}</span><span>📦 ${esc(formatBytes(downloaded)||'0 o')} / ${esc(formatBytes(total)||'—')}</span><span>👥 ${peers} pair(s)</span><span>⏱ ${etaText}</span>`;
  }
  const status=$('playStatus');
  if(status && !status.dataset.mediaError){
    status.textContent=pct>=100?'Téléchargement terminé · lecture disponible':`Téléchargement ${pct.toFixed(1)} % · ${formatRate(torrent.downloadSpeed)} · ${torrent.numPeers||0} pair(s)`;
  }
}
function mediaErrorText(video,file){
  const code=video.error?.code;
  const ext=(file?.name||'').split('.').pop()?.toLowerCase();
  if(['mkv','avi','ts','m2ts','mpeg','mpg'].includes(ext))return `Safari sur iPad ne sait généralement pas décoder ce conteneur (${ext.toUpperCase()}). Choisis une source MP4/MOV compatible. Le lecteur ne peut pas convertir la vidéo sans serveur de transcodage.`;
  if(code===3)return 'Safari a rencontré une erreur de décodage : codec vidéo/audio ou conteneur non compatible.';
  if(code===4)return 'Format ou source non pris en charge par Safari. Essaie une source MP4 H.264/AAC.';
  if(code===2)return 'Erreur réseau pendant la récupération des données vidéo.';
  return 'La vidéo n’a pas pu être décodée. Vérifie le format du fichier et la connexion aux pairs.';
}
function waitForMedia(video,timeout=30000,file=null){return new Promise((resolve,reject)=>{let done=false;const clean=()=>{clearTimeout(timer);video.removeEventListener('loadedmetadata',meta);video.removeEventListener('canplay',ready);video.removeEventListener('error',err)};const finish=(fn,v)=>{if(done)return;done=true;clean();fn(v)};const meta=()=>{};const ready=()=>finish(resolve,true);const err=()=>finish(reject,new Error(mediaErrorText(video,file)));const timer=setTimeout(()=>finish(reject,new Error('Le flux est attaché mais Safari ne reçoit pas de données vidéo après 30 secondes. Cela peut venir de l’absence de pairs WebRTC ou d’un codec non pris en charge.')),timeout);video.addEventListener('loadedmetadata',meta);video.addEventListener('canplay',ready);video.addEventListener('error',err);if(video.error)err();else if(video.readyState>=3)ready()})}
async function playTorrent(stream){
  const status=$('playStatus'),video=$('videoPlayer');showPlayer();status.dataset.mediaError='';status.textContent='Initialisation du moteur torrent…';
  try{
    stopPlayback();
    const WebTorrent=await loadWebTorrent();
    if(!WebTorrent)throw new Error('Moteur WebTorrent indisponible. Vérifie la connexion et le chargement du CDN.');
    if(WebTorrent.WEBRTC_SUPPORT===false)throw new Error('WebRTC n’est pas pris en charge par ce navigateur. Le moteur torrent dans le navigateur ne pourra pas joindre les pairs.');
    if(!('serviceWorker'in navigator))throw new Error('Le navigateur ne prend pas en charge le Service Worker nécessaire au flux torrent.');
    status.textContent='Activation du serveur vidéo local…';
    const registration=await navigator.serviceWorker.register('./sw.js',{scope:'./'});
    await navigator.serviceWorker.ready;
    if(!registration.active)throw new Error('Le Service Worker est installé mais pas actif. Ferme les autres onglets Stremio Glass, recharge la page puis réessaie.');
    if(!navigator.serviceWorker.controller){status.textContent='Prise de contrôle du lecteur par le Service Worker…';await new Promise(resolve=>{let done=false;const finish=()=>{if(done)return;done=true;navigator.serviceWorker.removeEventListener('controllerchange',finish);resolve()};navigator.serviceWorker.addEventListener('controllerchange',finish);setTimeout(finish,5000)});}
    if(!navigator.serviceWorker.controller)throw new Error('Le Service Worker actif ne contrôle pas cette page. Recharge complètement Stremio Glass puis relance la source.');
    if(!registration.active){await new Promise((resolve,reject)=>{const worker=registration.installing||registration.waiting;if(!worker)return reject(new Error('Service Worker inactif. Recharge la page et réessaie.'));worker.addEventListener('statechange',()=>{if(worker.state==='activated')resolve();if(worker.state==='redundant')reject(new Error('Le Service Worker n’a pas pu s’activer.'))})})}
    torrentClient=new WebTorrent();
    torrentClient.on('error',e=>{console.error('WebTorrent client error',e);if($('playStatus')){$('playStatus').dataset.mediaError='1';$('playStatus').textContent='Erreur du moteur torrent : '+(e.message||'inconnue')}});
    try{torrentClient.createServer({controller:registration});}catch(serverError){throw new Error('Impossible de créer le serveur vidéo WebTorrent via le Service Worker : '+(serverError.message||serverError));}
    const torrentSpec=torrentInput(stream);
    status.textContent='Identifiant validé · recherche de pairs WebRTC…';
    const peerWatch=setInterval(()=>{if(activeTorrent&&activeTorrent!==null){clearInterval(peerWatch);return}if(torrentClient&&$('playStatus')&&!$('playStatus').dataset.mediaError){const peers=torrentClient.torrents?.[0]?.numPeers||0;if(peers>0)status.textContent='Pair(s) WebRTC connecté(s) : '+peers+' · récupération des métadonnées…'}},1200);
    const torrent=await new Promise((resolve,reject)=>{
      let settled=false;
      const finish=(fn,value)=>{if(settled)return;settled=true;clearTimeout(timer);clearInterval(peerWatch);fn(value)};
      const timer=setTimeout(()=>finish(reject,new Error('Le torrent n’a pas terminé son initialisation après 90 secondes. aucun pair WebRTC compatible ne partage peut-être ce torrent. Les pairs BitTorrent TCP/UDP classiques ne sont pas joignables depuis Safari.')),90000);
      // The callback is called when metadata AND the torrent storage are ready.
      // Waiting for `metadata` alone can be too early for file selection/streaming.
      let t;try{t=torrentClient.add(torrentSpec.magnet,{strategy:'sequential'},readyTorrent=>finish(resolve,readyTorrent));}catch(addError){finish(reject,new Error('WebTorrent a refusé le lien magnet construit ('+torrentSpec.magnet.slice(0,72)+'…). Vérifie le hash fourni par Torrentio. Détail : '+(addError.message||addError)));return;}
      t.on('error',e=>finish(reject,e));
      t.on('ready',()=>finish(resolve,t));
      t.on('warning',e=>{console.warn('WebTorrent warning',e);status.textContent='Avertissement torrent : '+(e.message||String(e))});
      t.on('noPeers',kind=>{if(!settled)status.textContent='Recherche de pairs WebRTC… ('+kind+')'});
    });
    activeTorrent=torrent;
    const requestedIndex=Number.parseInt(stream.fileIdx,10);
    let file=Number.isInteger(requestedIndex)&&requestedIndex>=0?torrent.files[requestedIndex]:null;
    const supportedExtensions=['mp4','m4v','mov','webm'];
    const canPlayFile=f=>{
      const ext=(f.name.split('.').pop()||'').toLowerCase();
      if(!supportedExtensions.includes(ext))return false;
      const mime=ext==='mov'?'video/quicktime':ext==='webm'?'video/webm':'video/mp4';
      return !video.canPlayType || video.canPlayType(mime)!=='';
    };
    if(file&&!canPlayFile(file)){
      const requestedName=file.name;
      const alternative=torrent.files.find(canPlayFile);
      if(alternative)file=alternative;
      else throw new Error(`Le torrent contient « ${requestedName} », mais aucun fichier vidéo dans un format reconnu par Safari (MP4/MOV/WebM). Un fichier MKV/HEVC/DTS peut rester noir : il faut une source compatible ou un serveur de transcodage.`);
    }
    if(!file){file=torrent.files.filter(canPlayFile).sort((a,b)=>b.length-a.length)[0]||null}
    if(!file){const names=torrent.files.filter(f=>/\.(mp4|m4v|mov|webm|mkv|avi|ts)$/i.test(f.name)).slice(0,5).map(f=>f.name).join(', ');throw new Error('Aucun fichier vidéo compatible trouvé dans ce torrent.'+(names?' Fichiers détectés : '+names:''));}
    file.select();
    status.textContent='Fichier sélectionné : '+file.name+' · '+formatBytes(file.length)+' · préparation du flux…';
    const bar=$('torrentProgressBar'),label=$('torrentProgressLabel');if(bar)bar.style.width='0%';if(label)label.textContent='0 %';
    // Official WebTorrent browser path: streamTo() binds the file to the
    // Service-Worker HTTP server and assigns the resulting URL to the media element.
    video.pause();video.removeAttribute('src');video.load();
    video.onerror=()=>{const message=mediaErrorText(video,file);status.dataset.mediaError='1';status.textContent=message;console.error('Video element error',video.error, 'source:',video.currentSrc)};
    video.onloadedmetadata=()=>{status.textContent='Vidéo détectée · '+video.videoWidth+'×'+video.videoHeight+' · '+file.name};
    video.oncanplay=()=>{status.dataset.mediaError='';status.textContent='Vidéo prête · '+file.name};
    file.on('stream',({req})=>{status.textContent='Le lecteur demande les données vidéo…';console.info('WebTorrent media request',req?.url,req?.headers?.range)});
    // Attach media listeners BEFORE streamTo() and play(): Safari may emit
    // loadedmetadata/canplay very quickly, before an awaited play() settles.
    const mediaReady=waitForMedia(video,30000,file);
    file.streamTo(video);
    // WebTorrent in a browser uses temporary in-memory pieces by default;
    // destroy the torrent/client when playback ends to release those resources.
    video.addEventListener('ended',()=>{if(activeTorrent===torrent)stopPlayback()},{once:true});
    const streamURL=file.streamURL||video.currentSrc||video.src;
    if(!streamURL)throw new Error('WebTorrent n’a créé aucune adresse de flux. Le serveur vidéo du Service Worker ne répond pas.');
    console.info('WebTorrent stream URL',streamURL);
    torrentStatsTimer=setInterval(()=>updateTorrentProgress(torrent,file),700);
    torrent.on('download',()=>updateTorrentProgress(torrent,file));
    torrent.on('wire',()=>updateTorrentProgress(torrent,file));
    torrent.on('noPeers',()=>updateTorrentProgress(torrent,file));
    updateTorrentProgress(torrent,file);
    try{await video.play()}catch(e){status.textContent='Flux préparé. Appuie sur Lecture.'}
    mediaReady.then(()=>{status.dataset.mediaError='';status.textContent='Lecture vidéo active · '+file.name}).catch(e=>{if(!video.error){status.dataset.mediaError='1';status.textContent=e.message}});
  }catch(e){status.dataset.mediaError='1';status.textContent=e.message||'Impossible de démarrer ce torrent.';console.warn('Torrent playback error',e);if(torrentClient){try{torrentClient.destroy()}catch{}torrentClient=null}activeTorrent=null;if(torrentStatsTimer){clearInterval(torrentStatsTimer);torrentStatsTimer=null}}
}
async function attachSubtitles(type,videoId){const tracks=await getSubtitles(type,videoId);const v=$('videoPlayer');for(const s of tracks){const src=safeUrl(s.url);if(!src)continue;const t=document.createElement('track');t.kind='subtitles';t.label=s.lang||s.language||'Sous-titres';t.srclang=(s.lang||s.language||'fr').slice(0,2);t.src=src;v.append(t)}}
async function playStream(stream,type,videoId){if(stream.infoHash||/^magnet:\?/i.test(String(stream.url||''))){await playTorrent(stream);return}if(stream.url){const url=safeUrl(stream.url);if(!url){alert('Cette URL de lecture n’est pas HTTP(S).');return}stopPlayback();activeVideoUrl=url;const v=$('videoPlayer');v.src=url;v.load();showPlayer();$('playStatus').textContent='Lecture directe. Si le format ou le serveur n’est pas pris en charge par Safari, la lecture peut échouer.';await attachSubtitles(type,videoId);v.play().catch(()=>{$('playStatus').textContent='Source chargée. Appuie sur Lecture.'});return}if(stream.ytId){$('playStatus').textContent='Cette source YouTube nécessite un lecteur dédié.';showPlayer();return}alert('Format de source non pris en charge par ce lecteur.')}
async function renderStreams(type,videoId,container){container.innerHTML='<p class="muted">Recherche des sources…</p>';const streams=await getStreams(type,videoId);if(!streams.length){container.innerHTML='<p class="muted">Aucune source trouvée par les addons activés.</p>';return}container.innerHTML=streams.map((s,i)=>{const kind=streamKind(s);const label=kind==='direct'?'URL directe':kind==='torrent'?'Torrentio / P2P':kind==='youtube'?'YouTube':'Non pris en charge';const desc=s.description||s.behaviorHints?.filename||s._addonName||'';return `<div class="stream"><div class="stream-info"><div class="stream-name">${esc(streamLabel(s,i))}</div><div class="card-sub">${esc(label)}${desc?' · '+esc(desc):''}</div>${streamBadges(s,kind)}</div><button class="${kind==='direct'||kind==='torrent'?'primary':''}" data-stream="${i}" ${kind==='unknown'?'disabled':''}>${kind==='torrent'?'Lire':kind==='direct'?'Lire':'Détails'}</button></div>`}).join('');container.querySelectorAll('[data-stream]').forEach(b=>b.onclick=()=>playStream(streams[Number(b.dataset.stream)],type,videoId))}
async function openMeta(type,id,fallback={}){$('modal').classList.remove('hidden');const box=$('detailContent');box.innerHTML='<div class="empty">Chargement de la fiche…</div>';stopPlayback();try{const meta=await getMeta(type,id,fallback);if(!meta)throw new Error('Métadonnées introuvables.');detailMeta=meta;const videos=Array.isArray(meta.videos)?meta.videos:[];box.innerHTML=`<div><img class="detail-poster" src="${esc(safeUrl(meta.poster||''))}" alt=""><div class="eyebrow">${esc(meta.type||type)}</div><h2>${esc(meta.name||'Sans titre')}</h2><div class="tagrow"><span class="pill">${esc(meta.year||'Année inconnue')}</span>${meta.imdbRating?`<span class="pill rating">★ ${esc(meta.imdbRating)} IMDb</span>`:''}${meta.runtime?`<span class="pill">${esc(meta.runtime)}</span>`:''}</div><p class="muted">${esc(meta.description||'Aucune description disponible.')}</p></div><div style="clear:both"></div><div id="playerArea" class="hidden"><div class="player-wrap"><video id="videoPlayer" controls playsinline webkit-playsinline preload="metadata"></video></div><div id="torrentProgressPanel" class="torrent-progress-panel"><div class="torrent-progress-head"><strong>Téléchargement torrent</strong><strong id="torrentProgressLabel">—</strong></div><div class="torrent-progress-track"><div id="torrentProgressBar" class="torrent-progress-fill"></div></div><div id="torrentStats" class="torrent-stats"><span>⬇ En attente</span><span>📦 —</span><span>👥 0 pair(s)</span><span>⏱ —</span></div></div><div class="player-controls" aria-label="Commandes du lecteur"><button id="playerPlay" type="button">▶︎ Lecture</button><label class="small muted" for="playerSpeed">Vitesse</label><select id="playerSpeed" aria-label="Vitesse de lecture"><option value="0.5">0,5×</option><option value="0.75">0,75×</option><option value="1" selected>1×</option><option value="1.25">1,25×</option><option value="1.5">1,5×</option><option value="1.75">1,75×</option><option value="2">2×</option></select><span class="grow"></span><button id="playerFullscreen" type="button">⛶ Plein écran</button></div><div id="playStatus" class="status player-statusline" role="status" aria-live="polite"></div></div><div class="divider"></div>${videos.length?`<h3>Épisodes</h3><div id="episodeList">${videos.map((v,i)=>`<div class="episode"><div class="stream-info"><b>${esc(v.title||v.name||'Épisode '+(i+1))}</b><div class="card-sub">${esc(v.season?'Saison '+v.season+' · ':'')}${esc(v.episode?'Épisode '+v.episode:'')}</div></div><button data-episode="${i}" class="primary">Sources</button></div>`).join('')}</div><div id="episodeStreams"></div>`:`<h3>Sources disponibles</h3><div id="streamList"></div>`}<div class="notice" style="margin-top:15px">Les flux directs dépendent des formats acceptés par Safari. Les torrents utilisent WebTorrent WebRTC expérimental : seuls les pairs WebRTC sont joignables depuis un navigateur. Les données torrent sont temporaires pendant la lecture ; arrêter/fermer le lecteur détruit le torrent et libère ses données en mémoire. Aucun téléchargement hors ligne n’est conservé par l’application.</div>`;if(videos.length){box.querySelectorAll('[data-episode]').forEach(b=>b.onclick=()=>{const v=videos[Number(b.dataset.episode)];renderStreams(type==='series'?'series':type,v.id||id,$('episodeStreams'))})}else{renderStreams(type,id,$('streamList'))}}catch(e){box.innerHTML=`<p class="muted">${esc(e.message)}</p>`}}
function baseFromManifest(manifestUrl){const u=new URL(manifestUrl);u.pathname=u.pathname.replace(/\/?manifest\.json$/i,'').replace(/\/$/,'');return u.origin+u.pathname+u.search}
function validateManifest(m){if(!m||typeof m!=='object'||!m.id||!m.name||!Array.isArray(m.resources)||!Array.isArray(m.types))throw new Error('Manifeste invalide : id, name, resources et types sont requis.');if(!m.resources.length)throw new Error('Cet addon ne déclare aucune ressource.');return m}
async function addAddon(){const input=$('addonUrl');const url=input.value.trim();if(!url){setAddonMessage('Colle une URL de manifeste.');return}let parsed;try{parsed=new URL(url)}catch{setAddonMessage('URL invalide.');return}if(parsed.protocol!=='https:'){setAddonMessage('Pour des raisons de sécurité, seuls les manifestes HTTPS sont acceptés.');return}if(parsed.username||parsed.password){setAddonMessage('Les identifiants intégrés dans une URL ne sont pas acceptés.');return}setAddonMessage('Vérification du manifeste…');$('addAddonBtn').disabled=true;try{const manifest=validateManifest(await fetchJSON(parsed.href));const base=baseFromManifest(parsed.href);if(addons.some(a=>a.base===base)){setAddonMessage('Cet addon est déjà installé.');return}addons.push({id:manifest.id,name:manifest.name,manifest:parsed.href,base,version:manifest.version||'',description:manifest.description||'',enabled:true,resources:manifest.resources,types:manifest.types,idPrefixes:manifest.idPrefixes||[],catalogs:manifest.catalogs||[]});saveAddons();input.value='';setAddonMessage(manifest.name+' ajouté avec succès.');renderAddons();}catch(e){setAddonMessage('Ajout impossible : '+e.message+'. Le serveur peut refuser les requêtes CORS.')}finally{$('addAddonBtn').disabled=false}}
function renderAddons(){const list=$('addonList');list.innerHTML=addons.map((a,i)=>`<div class="addon"><div><b>${esc(a.name)}</b><div class="card-sub">${esc(a.version||a.manifest)}</div><div class="card-sub">${esc((a.resources||[]).map(r=>typeof r==='string'?r:r.name).join(' · '))}</div></div><div class="row"><span class="pill">${a.builtin?'Système':a.enabled?'Actif':'Désactivé'}</span>${!a.builtin?`<button data-toggle="${i}">${a.enabled?'Désactiver':'Activer'}</button><button data-remove="${i}">Supprimer</button>`:''}</div></div>`).join('');list.querySelectorAll('[data-toggle]').forEach(b=>b.onclick=()=>{addons[Number(b.dataset.toggle)].enabled=!addons[Number(b.dataset.toggle)].enabled;saveAddons();renderAddons();loadHome()});list.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{addons.splice(Number(b.dataset.remove),1);saveAddons();renderAddons();loadHome()})}
async function searchCatalogs(query){const box=$('searchResults');box.innerHTML='<div class="empty">Recherche dans les addons…</div>';const jobs=[];for(const a of addons.filter(x=>x.enabled)){for(const type of ['movie','series']){for(const c of addonCatalogs(a,type)){const extra=(c.extra||[]).some(x=>x.name==='search');if(extra||a.builtin)jobs.push({a,type,c})}}}const results=await Promise.all(jobs.slice(0,16).map(async j=>{try{const d=await fetchJSON(endpoint(j.a,'catalog',j.type,j.c.id,{search:query,skip:0}));return d.metas||[]}catch{return []}}));const merged=[];const seen=new Set();for(const item of results.flat()){const k=item.id+'|'+item.type;if(!seen.has(k)){seen.add(k);merged.push(item)}}$('searchCount').textContent=merged.length+' résultat(s)';renderCards(box,merged)}
$('searchInput').addEventListener('input',e=>{clearTimeout(searchTimer);const q=e.target.value.trim();if(!q){if(currentView==='search')showView('home');return}showView('search');searchTimer=setTimeout(()=>searchCatalogs(q),450)});
document.querySelectorAll('.bottom button').forEach(b=>b.onclick=()=>showView(b.dataset.view));$('settingsBtn').onclick=()=>showView('addons');$('exploreBtn').onclick=()=>$('homeCatalogs').scrollIntoView({behavior:'smooth'});$('addAddonBtn').onclick=addAddon;$('closeModal').onclick=closeModal;
function bindPlayerControls(){const v=$('videoPlayer');if(!v)return;const play=$('playerPlay'),speed=$('playerSpeed'),full=$('playerFullscreen');if(play)play.onclick=()=>{if(v.paused)v.play().catch(()=>{});else v.pause()};if(speed)speed.onchange=()=>{v.playbackRate=Number(speed.value)||1};if(full)full.onclick=()=>{const wrap=v.closest('.player-wrap');try{
  if(v.error){$('playStatus').textContent='Plein écran indisponible : le lecteur vidéo est en erreur. Lance d’abord une source qui charge correctement.';return}
  if(v.readyState<1){$('playStatus').textContent='Plein écran indisponible : attends que la vidéo soit chargée (métadonnées reçues), puis réessaie.';return}
  if(typeof v.webkitEnterFullscreen==='function'){v.webkitEnterFullscreen();return}
  if(typeof v.requestFullscreen==='function'){const p=v.requestFullscreen();if(p?.catch)p.catch(e=>{$('playStatus').textContent='Safari a refusé le plein écran : '+(e.message||'réessaie après le démarrage de la vidéo.')});return}
  if(wrap&&typeof wrap.requestFullscreen==='function'){const p=wrap.requestFullscreen();if(p?.catch)p.catch(e=>$('playStatus').textContent='Plein écran indisponible : '+(e.message||'Safari a refusé la demande.'));return}
  $('playStatus').textContent='Le plein écran n’est pas pris en charge par cette version de Safari.'
}catch(e){$('playStatus').textContent='Plein écran indisponible : '+(e.message||'Safari a refusé la demande.')}};v.addEventListener('play',()=>{if(play)play.textContent='Ⅱ Pause'});v.addEventListener('pause',()=>{if(play)play.textContent='▶︎ Lecture'});v.addEventListener('ratechange',()=>{if(speed)speed.value=String(v.playbackRate)})}
const playerObserver=new MutationObserver(()=>bindPlayerControls());playerObserver.observe($('detailContent'),{childList:true,subtree:true});$('modal').addEventListener('click',e=>{if(e.target.id==='modal')closeModal()});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('modal').classList.contains('hidden'))closeModal()});
async function init(){try{const manifest=await fetchJSON(CINEMETA);DEFAULT_ADDON.resources=manifest.resources||DEFAULT_ADDON.resources;DEFAULT_ADDON.types=manifest.types||DEFAULT_ADDON.types;DEFAULT_ADDON.catalogs=manifest.catalogs?.length?manifest.catalogs:DEFAULT_ADDON.catalogs;addons[0]=structuredClone(DEFAULT_ADDON)}catch(e){console.warn('Cinemeta manifest indisponible',e)}loadHome();if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(console.warn)}
init();
