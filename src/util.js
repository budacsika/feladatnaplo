// Általános segédek: azonosító, dátum/idő formázás és normalizálás (DOM-mentes)

export const pad = n => String(n).padStart(2,'0');

export const dstr = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

export const todayStr = () => dstr(new Date());

export const stamp = () => { const d = new Date(); return `${dstr(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };

let seq = 0;

export const newId = () => 't' + Date.now().toString(36) + (seq++).toString(36) + Math.random().toString(36).slice(2,5);

// kis/nagybetű- és ékezetfüggetlen összevetés (hossztartó átalakítás, hogy a kiemelés indexei stimmeljenek)
export const fold = s => String(s).replace(/[^\u0000-\u007f]/g, ch => ch.normalize('NFD')[0] || ch).toLowerCase();

// valódi naptári ellenőrzés: szökőév, hónapok hossza (pl. feb. 31., 2027-02-29 érvénytelen)
export function validYMD(y, mo, d){
  if (!Number.isInteger(y) || !Number.isInteger(mo) || !Number.isInteger(d)) return false;
  if (y < 1900 || y > 2100 || mo < 1 || mo > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, mo, 0)).getUTCDate();
}

export function normDate(s){
  s = String(s||'').trim(); let m, y, mo, d;
  if ((m = s.match(/^(\d{4})[-./\s]+(\d{1,2})[-./\s]+(\d{1,2})\.?$/))) { y=+m[1]; mo=+m[2]; d=+m[3]; }
  else if ((m = s.match(/^(\d{1,2})[-./]\s*(\d{1,2})[-./]\s*(\d{4})\.?$/))) { d=+m[1]; mo=+m[2]; y=+m[3]; }
  else return '';
  if (!validYMD(y, mo, d)) return '';
  return `${y}-${pad(mo)}-${pad(d)}`;
}

// dátum vagy dátum+idő (Excel-es "2026.11.09 16:00" és "2026. 11. 09. 16:00:00" alakok is) → ISO
export function normStamp(s){
  s = String(s||'').trim(); if (!s) return '';
  const m = s.match(/^(\d{4})[-./\s]+(\d{1,2})[-./\s]+(\d{1,2})\.?(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) return '';
  const date = normDate(`${m[1]}-${m[2]}-${m[3]}`); if (!date) return '';
  if (m[4] === undefined) return date;
  if (+m[4] > 23 || +m[5] > 59 || (m[6] !== undefined && +m[6] > 59)) return '';
  return `${date}T${pad(+m[4])}:${m[5]}` + (m[6] !== undefined ? ':' + m[6] : '');
}

export const normDeadline = s => { const v = normStamp(s); return v.length > 16 ? v.slice(0,16) : v; };

/* --- határidők --- */
export const toMs = s => { const m = String(s||'').match(/^(\d{4})-(\d\d)-(\d\d)(?:T(\d\d):(\d\d)(?::(\d\d))?)?$/); return m ? new Date(+m[1], +m[2]-1, +m[3], +(m[4]||0), +(m[5]||0), +(m[6]||0)).getTime() : NaN; };

export const fmtLeft = ms => { const m = Math.max(0, Math.ceil(ms/60000)); return m < 60 ? `${m} p` : (m % 60 ? `${Math.floor(m/60)} ó ${m%60} p` : `${m/60} ó`); };

export const fmtAgo = ms => { const m = Math.floor(ms/60000); if (m < 1) return 'épp most'; if (m < 60) return `${m} perce`; const h = Math.floor(m/60); return h < 48 ? `${h} órája` : `${Math.floor(h/24)} napja`; };

export const fmtDur = ms => ms < 3600e3 ? `${Math.max(1,Math.round(ms/60000))} p` : ms < 48*3600e3 ? `${(ms/3600e3).toFixed(1).replace('.',',')} ó` : `${(ms/86400e3).toFixed(1).replace('.',',')} n`;

/* --- időszakok és statisztika --- */
export function weekDays(offset = 0, now = new Date()){
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate()); d.setDate(d.getDate() - ((d.getDay()+6)%7) + offset*7);
  return Array.from({length:7}, (_,i) => { const x = new Date(d); x.setDate(d.getDate()+i); return dstr(x); });
}

export function monthDays(offset = 0, now = new Date()){
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1), n = new Date(first.getFullYear(), first.getMonth()+1, 0).getDate();
  return { first, days: Array.from({length:n}, (_,i) => dstr(new Date(first.getFullYear(), first.getMonth(), i+1))) };
}

export function isoWeek(d){
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  return Math.ceil(((t - Date.UTC(t.getUTCFullYear(),0,1)) / 86400000 + 1) / 7);
}
