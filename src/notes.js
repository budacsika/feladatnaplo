// Megjegyzések: szabad szöveges komment egy feladathoz, az előzmények (tortenet.csv) egy új eseménytípusaként
import { makeComment } from './history.js';
import { render } from './render.js';
import { st } from './state.js';
import { queueSave } from './storage.js';
import { stamp } from './util.js';

// Igaz, ha lett új megjegyzés (üres szövegnél nem történik semmi). kind: 'szunet', ha a szüneteltetéskor íródott.
export function addComment(taskId, text, kind){
  const e = makeComment(taskId, text, kind, stamp());
  if (!e) return false;
  st.hist.push(e);
  queueSave('h');
  render();
  return true;
}
