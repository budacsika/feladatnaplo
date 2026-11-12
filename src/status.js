// Értesítés (toast) és a tárolás-állapotjelző
import { $, FILE_NAME, st } from './state.js';
import { pad } from './util.js';

let toastTimer;

export function toast(msg, action, fn){
  const el = $('#toast'); el.textContent = '';
  const sp = document.createElement('span'); sp.textContent = msg; el.append(sp);
  if (action) { const b = document.createElement('button'); b.type = 'button'; b.textContent = action; b.onclick = () => { fn(); el.classList.remove('show'); }; el.append(b); }
  el.classList.add('show'); clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), action ? 7000 : 4500);
}

/* ---------- tárolás állapotjelző ---------- */
export function errText(e){
  if (!e) return '';
  if (e.name === 'NoModificationAllowedError' || e.name === 'InvalidStateError') return 'a fájl zárolt (nyitva van Excelben?)';
  if (e.name === 'NotAllowedError') return 'nincs írási engedély';
  if (e.name === 'NotFoundError') return 'a mappa vagy fájl nem található';
  return e.message || String(e);
}

export function renderStatus(){
  let cls = 'warn', txt = '';
  const name = st.dir ? st.dir.name : '';
  if (st.saving || ((st.dirty || st.dirtyP) && st.mode === 'folder' && !st.err)) txt = 'Mentés…';
  else if (st.err) { cls = 'err'; txt = 'Mentési hiba: ' + errText(st.err) + ' – kattints az újrapróbáláshoz'; }
  else if (st.mode === 'folder') { cls = 'ok'; const d = st.savedAt;
    txt = `Mentve · ${name}/${FILE_NAME}` + (d ? ` · ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` : ''); }
  else if (st.mode === 'needperm') txt = `Kattints a csatlakozáshoz: ${name}`;
  else if (st.mode === 'none') txt = 'Nincs mappa kiválasztva – most csak a böngészőben tárolódik. Kattints ide!';
  else if (st.mode === 'blocked') { cls = 'err'; txt = 'A CSV formátuma ismeretlen – nem írtam felül. Kattints másik mappa választásához.'; }
  else if (st.mode === 'unsupported') { cls = 'err'; txt = 'Ez a böngésző nem tud mappába menteni – használj Edge-et vagy Chrome-ot'; }
  const p = $('#pill'); p.className = 'pill ' + cls; p.querySelector('span').textContent = txt; p.title = txt;
}
