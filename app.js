/* Interfaccia e stato dell'applicazione. */
(function () {
  'use strict';
  const D = window.Data, C = window.Calc, CH = window.Charts;
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const fx = (x, d) => (x == null || !isFinite(x)) ? '—' : Number(x).toFixed(d == null ? 1 : d);
  const KEY = 'armoniche_bt_project_v1', LIBKEY = 'armoniche_bt_userlib_v1';
  const MAXINV = 10;

  /* ---------------- stato ---------------- */
  let idc = 0;
  function newInv(entry, topoKey) {
    const tk = topoKey || entry.topo || 'six_choke3', T = D.TOPOLOGIES[tk];
    return { id: 'i' + (++idc) + '_' + Math.random().toString(36).slice(2, 5), name: entry.model || T.name, brand: entry.brand || '',
      topo: tk, Pn: entry.Pn || 55, eta: entry.eta || T.eta, cos: entry.cos || T.cos, qty: entry.qty || 1, kSim: 100, theta: 0,
      regen: !!(entry.regen || T.regen), spec: Object.assign({}, entry.spec || T.spec) };
  }
  function defaults() {
    const lib = n => D.LIBRARY.find(x => x.model.indexOf(n) >= 0);
    const invs = [newInv(Object.assign({ qty: 4 }, lib('ACS580-01'))), newInv(Object.assign({ qty: 2 }, lib('FC 302 (6p'))),
                  newInv(Object.assign({ qty: 1 }, lib('ACS880-31'))), newInv(Object.assign({ qty: 1, Pn: 200 }, lib('VLT 12-pulse')))];
    const scen = [['100% – tutti in marcia', 100], ['75% del carico', 75], ['50% del carico', 50]].map(([name, l]) => {
      const s = { name, defLoad: l, items: {} }; invs.forEach(i => s.items[i.id] = { on: true, load: l }); return s; });
    return {
      v: 1, meta: { name: 'Quadro BT – nuovo progetto', client: '', author: '', rev: '00', notes: '' },
      context: 'industria',
      modules: { thdv: true, thdi: true, busbar: true, trafo: true, cable: true, reson: true },
      net: { V: 400, f: 50, mode: 'trafo', Ik: 30, xr: 5, sscMV: 250, xrMV: 10, trafo: { Sn: 1600, uk: 6, Pcu: 15000, pec: 8 },
             link: { R: 0.05, X: 0.1 }, gen: { Sn: 800, xd: 14, xr: 15 }, bg: { 5: 1.5, 7: 1, 11: 0.5, 13: 0.5 } },
      trafoq: 1.7,
      cap: { on: false, Qc: 200, detune: 7, ilim: 1.3 },
      linear: { P: 200, cos: 0.9 },
      bus: { mat: 'Cu', n: 2, w: 120, t: 10, In: 2000, Ta: 35, Tmax: 105, Tref: 35, Top: 90, cp: 0.35, neutralOn: false, neutralPct: 50 },
      cable: { on: false, mat: 'Cu', S: 240, np: 4, Iz: 1600 },
      limits: { volt: 'iec24c3', vcustom: { thd: 5, flat: 3 }, cur: 'ieee519', IL: 0, thdvTarget: 6, warnPct: 80 },
      method: { sum: 'iec', beta: 1 },
      inverters: invs, scenarios: scen,
      mitig: { active: false, topo: {}, af: { on: false, Ir: 200, eff: 90, hmax: 49 } }
    };
  }
  let S = (function () {
    try { const j = JSON.parse(localStorage.getItem(KEY)); if (j && j.v === 1) { j.inverters.forEach(i => { const m = /^i(\d+)/.exec(i.id); if (m) idc = Math.max(idc, +m[1]); }); return j; } } catch (e) {}
    return defaults();
  })();
  let page = 'proj', selScen = -1, saveT = null;

  const get = p => p.split('.').reduce((o, k) => o == null ? o : o[k], S);
  function set(p, v) { const ks = p.split('.'); let o = S; for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]]; o[ks[ks.length - 1]] = v; }
  function persist() { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }, 300); }

  /* ---------------- helper UI ---------------- */
  function F(label, path, o) {
    o = o || {}; const v = get(path), t = o.t || 'n', r = o.r ? ' data-r="1"' : '';
    let inp;
    if (t === 'sel') inp = `<select data-p="${path}" data-t="s"${r}>${o.opts.map(([k, l]) => `<option value="${esc(k)}"${String(k) === String(v) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    else if (t === 'chk') inp = `<input type="checkbox" data-p="${path}" data-t="b"${r}${v ? ' checked' : ''}>`;
    else if (t === 'txt') inp = `<input type="text" data-p="${path}" data-t="s" value="${esc(v)}">`;
    else inp = `<input type="number" step="${o.step || 'any'}"${o.min != null ? ' min="' + o.min + '"' : ''} data-p="${path}" data-t="n"${r} value="${v == null ? '' : v}">`;
    return `<label class="fld ${t === 'chk' ? 'chk' : ''}"><span>${label}${o.unit ? ' <i>' + o.unit + '</i>' : ''}</span>${inp}${o.help ? '<small>' + o.help + '</small>' : ''}</label>`;
  }
  const card = (title, body, cls) => `<section class="card ${cls || ''}"><h3>${title}</h3>${body}</section>`;
  const badge = s => `<span class="badge st-${s}">${s === 'ok' ? 'OK' : s === 'warn' ? 'ATTENZIONE' : 'NON CONFORME'}</span>`;
  const selOpts = obj => Object.keys(obj).map(k => [k, obj[k].name]);

  /* ---------------- pagine ---------------- */
  const PAGES = [['proj', '1 · Progetto'], ['rete', '2 · Rete & carichi'], ['sbarra', '3 · Sbarra & cavo'], ['inv', '4 · Inverter'],
                 ['scen', '5 · Scenari'], ['lim', '6 · Limiti & metodo'], ['ris', '7 · Risultati'], ['mit', '8 · Mitigazioni'], ['rel', '9 · Relazione']];

  function pgProj() {
    const ctx = D.CONTEXTS[S.context];
    const mods = [['thdv', 'THDv sulla sbarra'], ['thdi', 'Correnti armoniche / THDi / TDD al PCC'], ['busbar', 'Sbarratura (declassamento armonico)'],
                  ['trafo', 'Trasformatore (fattore K / derating)'], ['cable', 'Cavo di arrivo'], ['reson', 'Rifasamento e risonanza']];
    return card('Dati di progetto', `<div class="grid2">${F('Nome progetto', 'meta.name', { t: 'txt' })}${F('Committente', 'meta.client', { t: 'txt' })}${F('Progettista', 'meta.author', { t: 'txt' })}${F('Revisione', 'meta.rev', { t: 'txt' })}</div>
      <label class="fld"><span>Note</span><textarea data-p="meta.notes" data-t="s" rows="2">${esc(S.meta.notes)}</textarea></label>`)
      + card('Applicazione (preseleziona limiti e consigli)', `${F('Contesto applicativo', 'context', { t: 'sel', opts: selOpts(D.CONTEXTS), r: 1 })}
      <div class="advice"><b>Consigli per questa applicazione</b><ul>${ctx.tips.map(t => '<li>' + esc(t) + '</li>').join('')}</ul>
      ${ctx.attention.length ? '<b>Parametri da attenzionare</b><ul class="warnl">' + ctx.attention.map(t => '<li>' + esc(t) + '</li>').join('') + '</ul>' : ''}</div>
      <p class="muted">Cambiando contesto vengono riapplicati set di limiti e obiettivo THDv (modificabili in "Limiti & metodo").</p>`)
      + card('Verifiche da eseguire', `<div class="grid2">${mods.map(m => F(m[1], 'modules.' + m[0], { t: 'chk', r: 1 })).join('')}</div>`);
  }

  function pgRete() {
    const n = S.net, m = n.mode;
    const modeF = m === 'trafo'
      ? `<div class="grid3">${F('Potenza cc rete MT', 'net.sscMV', { unit: 'MVA' })}${F('X/R rete MT', 'net.xrMV')}${F('Potenza trasformatore', 'net.trafo.Sn', { unit: 'kVA' })}
          ${F('Tensione di cc uk', 'net.trafo.uk', { unit: '%' })}${F('Perdite nel rame Pcu', 'net.trafo.Pcu', { unit: 'W' })}${F('Eddy PEC-R a In', 'net.trafo.pec', { unit: '%', help: 'Perdite per correnti parassite / perdite I²R (oil 1–5, resina 8–15)' })}
          ${F('R collegamento trafo–sbarra', 'net.link.R', { unit: 'mΩ' })}${F('X collegamento trafo–sbarra', 'net.link.X', { unit: 'mΩ' })}</div>`
      : m === 'icc'
        ? `<div class="grid3">${F('Icc trifase al quadro', 'net.Ik', { unit: 'kA' })}${F('X/R', 'net.xr')}${F('Potenza trasformatore (per verifica K)', 'net.trafo.Sn', { unit: 'kVA' })}${F('Eddy PEC-R', 'net.trafo.pec', { unit: '%' })}</div>`
        : `<div class="grid3">${F('Potenza gruppo', 'net.gen.Sn', { unit: 'kVA' })}${F("Reattanza subtransitoria Xd''", 'net.gen.xd', { unit: '%' })}${F('X/R', 'net.gen.xr')}</div>`;
    const lin = F('Potenza carichi lineari', 'linear.P', { unit: 'kW', help: 'Carichi resistivi/induttivi: smorzano la risonanza' }) + F('cosφ carichi lineari', 'linear.cos');
    const cap = F('Rifasamento presente', 'cap.on', { t: 'chk', r: 1 }) + (S.cap.on ? F('Potenza batteria a 400 V', 'cap.Qc', { unit: 'kvar' })
      + F('Reattanza di sintonia p', 'cap.detune', { t: 'sel', opts: [[0, '0 % – condensatori puri'], [5.67, '5,67 % (fres 210 Hz)'], [7, '7 % (fres 189 Hz)'], [14, '14 % (fres 134 Hz)']] })
      + F('Limite corrente condensatori', 'cap.ilim', { unit: '×In' }) : '');
    const bg = [5, 7, 11, 13].map(h => F('Tensione di fondo h' + h, 'net.bg.' + h, { unit: '%' })).join('');
    return card('Alimentazione', `<div class="grid3">${F('Tensione concatenata', 'net.V', { unit: 'V' })}${F('Frequenza', 'net.f', { unit: 'Hz' })}
      ${F('Origine della Ssc', 'net.mode', { t: 'sel', r: 1, opts: [['trafo', 'Calcolo da rete MT + trasformatore'], ['icc', 'Icc nota al quadro'], ['gen', 'Gruppo elettrogeno in isola']] })}</div>${modeF}
      <div id="netsum" class="sumbox"></div>`)
      + card('Carichi lineari e rifasamento', `<div class="grid3">${lin}</div><div class="grid3">${cap}</div>`)
      + card('Distorsione di fondo a monte (tensione, % di V1)', `<div class="grid4">${bg}</div><p class="muted">Armoniche già presenti in rete (da misura). Si combinano con quelle generate dagli inverter con la legge IEC/TR 61000-3-6.</p>`);
  }

  function pgSbarra() {
    const b = S.bus;
    return card('Sbarra principale', `<div class="grid3">${F('Materiale', 'bus.mat', { t: 'sel', opts: [['Cu', 'Rame'], ['Al', 'Alluminio']] })}${F('N. barre per fase', 'bus.n', { min: 1, step: 1 })}
      ${F('Larghezza barra', 'bus.w', { unit: 'mm' })}${F('Spessore barra', 'bus.t', { unit: 'mm' })}${F('Corrente nominale sbarra In', 'bus.In', { unit: 'A', help: 'Valore a 35 °C di riferimento, da catalogo/IEC 61439' })}
      ${F('Temperatura ambiente nel quadro', 'bus.Ta', { unit: '°C' })}${F('Temperatura limite sbarra', 'bus.Tmax', { unit: '°C', help: 'IEC 61439: tipicamente 105 °C (ΔT 70 K su 35 °C)' })}${F('Temperatura di riferimento In', 'bus.Tref', { unit: '°C' })}
      ${F('Temperatura di esercizio per ρ', 'bus.Top', { unit: '°C' })}${F('Coefficiente di prossimità', 'bus.cp', { help: 'Modello semplificato (default 0,35); tarare con prove/FEM' })}</div>
      <div class="grid3">${F('Considera neutro (carichi monofase)', 'bus.neutralOn', { t: 'chk', r: 1 })}${S.bus.neutralOn ? F('Sezione neutro', 'bus.neutralPct', { unit: '% di In' }) : ''}</div>
      <div id="bussum" class="sumbox"></div>`)
      + card('Cavo/linea di arrivo (opzionale)', `<div class="grid3">${F('Verifica cavo', 'cable.on', { t: 'chk', r: 1 })}${S.cable.on ? F('Materiale', 'cable.mat', { t: 'sel', opts: [['Cu', 'Rame'], ['Al', 'Alluminio']] }) + F('Sezione', 'cable.S', { unit: 'mm²' })
      + F('Cavi in parallelo per fase', 'cable.np', { min: 1, step: 1 }) + F('Portata Iz per singolo cavo (corretta)', 'cable.Iz', { unit: 'A' }) : ''}</div>`);
  }

  function invCard(inv, i) {
    const T = D.TOPOLOGIES[inv.topo] || D.TOPOLOGIES.custom;
    let spec = '<div class="spec">';
    for (let h = 2; h <= 50; h++) spec += `<label class="sp${h % 2 && h % 3 ? ' key' : ''}">h${h}<input type="number" step="any" min="0" data-p="inverters.${i}.spec.${h}" data-t="sp" value="${inv.spec[h] != null ? inv.spec[h] : ''}"></label>`;
    spec += '</div>';
    return `<section class="card inv" data-i="${i}"><div class="invh"><b>${i + 1}.</b>${F('Nome', 'inverters.' + i + '.name', { t: 'txt' })}
      <div class="btns"><button data-act="dup" data-i="${i}">Duplica</button><button data-act="savelib" data-i="${i}">Salva in libreria</button><button class="danger" data-act="del" data-i="${i}">Elimina</button></div></div>
      <div class="grid4">${F('Costruttore', 'inverters.' + i + '.brand', { t: 'txt' })}
      ${F('Topologia', 'inverters.' + i + '.topo', { t: 'sel', r: 1, opts: selOpts(D.TOPOLOGIES) })}
      ${F('Potenza nominale (uscita)', 'inverters.' + i + '.Pn', { unit: 'kW' })}${F('Rendimento η', 'inverters.' + i + '.eta')}
      ${F('cosφ1 di ingresso', 'inverters.' + i + '.cos')}${F('Quantità', 'inverters.' + i + '.qty', { min: 0, step: 1 })}${F('Contemporaneità', 'inverters.' + i + '.kSim', { unit: '%' })}
      ${F('Sfasamento alimentazione θ', 'inverters.' + i + '.theta', { unit: '°', help: 'Usato solo con somma vettoriale (es. 30° da trasf. Dy)' })}</div>
      <div class="sumbox" id="invsum${i}"></div>
      <details><summary>Spettro armonico (% di I1) – ${T.thdi}</summary><div class="btns"><button data-act="applytopo" data-i="${i}">Ripristina spettro tipico della topologia</button>
      <button data-act="scale" data-i="${i}">Scala a THDi target…</button></div>${spec}<p class="muted">${D.REF_SPECTRUM}</p></details></section>`;
  }
  function pgInv() {
    const user = userLib();
    const opts = D.LIBRARY.map((x, k) => `<option value="L${k}">${esc(x.brand)} – ${esc(x.model)}</option>`).join('')
      + (user.length ? '<optgroup label="Libreria utente">' + user.map((x, k) => `<option value="U${k}">${esc(x.brand || '')} – ${esc(x.name)}</option>`).join('') + '</optgroup>' : '');
    return card('Libreria modelli', `<div class="row"><select id="libsel">${opts}</select><button class="primary" data-act="addlib">Aggiungi inverter</button><button data-act="addblank">Aggiungi vuoto</button>
      <button data-act="explib">Esporta libreria utente</button><button data-act="implib">Importa libreria</button></div>
      <p class="muted">Inverter inseriti: <b>${S.inverters.length}/${MAXINV}</b>. Gli spettri sono tipici di topologia e vanno sostituiti con i dati del costruttore.</p>`)
      + S.inverters.map(invCard).join('');
  }

  function pgScen() {
    const head = S.scenarios.map((s, j) => `<th><input class="scn" type="text" data-p="scenarios.${j}.name" data-t="s" value="${esc(s.name)}">
      <div class="btns"><button data-act="dupscen" data-j="${j}">Dup.</button>${S.scenarios.length > 1 ? `<button class="danger" data-act="delscen" data-j="${j}">×</button>` : ''}</div></th>`).join('');
    const rows = S.inverters.map(inv => `<tr><td>${esc(inv.name)} <i>×${inv.qty}</i></td>${S.scenarios.map((s, j) => {
      const it = s.items[inv.id] || (s.items[inv.id] = { on: true, load: 100 });
      return `<td><label class="mini"><input type="checkbox" data-p="scenarios.${j}.items.${inv.id}.on" data-t="b"${it.on ? ' checked' : ''}> on</label>
        <input type="number" class="ld" step="5" min="0" max="120" data-p="scenarios.${j}.items.${inv.id}.load" data-t="n" value="${it.load}"> %</td>`; }).join('')}</tr>`).join('');
    return card('Scenari di funzionamento', `<p class="muted">Per ogni scenario scegli quali inverter sono in marcia e il fattore di carico. Il calcolo verifica tutti gli scenari e mostra il peggiore.</p>
      <div class="scroll"><table class="tbl"><thead><tr><th>Inverter</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>
      <button class="primary" data-act="addscen">+ Aggiungi scenario</button>`);
  }

  function pgLim() {
    const L = S.limits;
    return card('Limiti di tensione (sbarra)', `<div class="grid3">${F('Set di limiti', 'limits.volt', { t: 'sel', r: 1, opts: selOpts(D.VOLT_SETS) })}
      ${L.volt === 'custom' ? F('THDv limite', 'limits.vcustom.thd', { unit: '%' }) + F('Singola armonica limite', 'limits.vcustom.flat', { unit: '%' }) : ''}
      ${F('Obiettivo di progetto THDv', 'limits.thdvTarget', { unit: '%', help: '0 = disattivato' })}</div>`)
      + card('Limiti di corrente (punto di consegna)', `<div class="grid3">${F('Criterio', 'limits.cur', { t: 'sel', r: 1, opts: [['ieee519', 'IEEE 519-2022 (TDD, Isc/IL)'], ['iec312', 'IEC 61000-3-12 (Rsce)'], ['none', 'Nessuno']] })}
      ${L.cur === 'ieee519' ? F('IL – corrente di carico max', 'limits.IL', { unit: 'A', help: '0 = automatico (massimo fra gli scenari)' }) : ''}</div>`)
      + card('Metodo di calcolo', `<div class="grid3">${F('Somma correnti armoniche fra inverter', 'method.sum', { t: 'sel', opts: [['iec', 'Esponenziale IEC/TR 61000-3-6 (α=1;1,4;2)'], ['arith', 'Aritmetica (caso peggiore)'], ['rss', 'Quadratica (RSS)'], ['vec', 'Vettoriale (con sfasamenti θ)']] })}
      ${F('Esponente carico parziale β', 'method.beta', { help: '1 = armoniche ∝ carico; <1 = più prudente (0,5)' })}
      ${F('Esponente perdite trasformatore q', 'trafoq', { t: 'sel', opts: [[1.7, '1,7 – IEC 61378-1'], [2, '2,0 – IEEE C57.110']] })}
      ${F('Soglia "Attenzione"', 'limits.warnPct', { unit: '% del limite' })}</div>
      <p class="muted">Le unità identiche (stessa riga) sono sommate aritmeticamente; il metodo scelto si applica fra righe diverse.</p>`);
  }

  /* ---------------- risultati ---------------- */
  let RC = null;
  function results() { RC = C.computeAll(S); return RC; }
  function worstIdx(R) {
    let wi = 0, wu = -1;
    R.scenarios.forEach((r, i) => { const u = Math.max(0, ...r.checks.map(c => c.util)); r.worst = u; if (u > wu) { wu = u; wi = i; } });
    return wi;
  }
  function currentLimits(r) {
    const lim = []; const L = S.limits;
    for (let h = 2; h <= 50; h++) {
      if (L.cur === 'ieee519' && r.IL > 0) lim[h] = D.ieeeLimit(h, r.net.Isc / r.IL) * r.IL / 100;
      else if (L.cur === 'iec312' && isFinite(r.rsce)) { const l = D.iec312Limits(r.rsce); const k = { 5: 'I5', 7: 'I7', 11: 'I11', 13: 'I13' }[h]; if (k) lim[h] = l[k] * r.I1inv / 100; }
    }
    return lim;
  }
  function chartsFor(r) {
    const cur = [], vv = [], vl = [];
    for (let h = 2; h <= 50; h++) { cur[h] = r.Is[h]; vv[h] = r.Vh[h] / r.Vph * 100; vl[h] = D.voltLimit(S.limits.volt, h, S.limits.vcustom); }
    return {
      cur: CH.spectrum({ title: 'Correnti armoniche verso la rete (punto di consegna)', unit: 'A', vals: cur, limit: currentLimits(r), vals2: r.IhInv.map((x, k) => k >= 2 ? x : 0), legend: 'grigio: inverter · colore: verso rete' }),
      volt: CH.spectrum({ title: 'Tensioni armoniche sulla sbarra (% V1)', unit: '%', vals: vv, limit: vl }),
      imp: CH.lines({ title: 'Impedenza di rete vista dalla sbarra', unit: 'mΩ', xlab: 'ordine armonico h', marks: [5, 7, 11, 13],
        series: [{ name: '|Zs| solo rete', x: r.scan.h, y: r.scan.Zs, cls: 'ln2' }, { name: '|Znet| con carichi/rifasamento', x: r.scan.h, y: r.scan.Zn, cls: 'ln1' }] }),
      wave: CH.wave({ title: 'Forme d\'onda indicative (fasi tipiche di raddrizzatore)', i: r.wave.i, v: r.wave.v, vref: r.Vph * Math.SQRT2 })
    };
  }
  function kpi(label, val, unit, st, sub) { return `<div class="kpi st-b-${st || 'ok'}"><small>${label}</small><b>${val}<i>${unit || ''}</i></b>${sub ? '<em>' + sub + '</em>' : ''}</div>`; }
  function stOf(r, id) { const c = r.checks.find(x => x.id === id); return c ? c.status : 'ok'; }
  function overall(r) { return r.checks.some(c => c.status === 'ko') ? 'ko' : r.checks.some(c => c.status === 'warn') ? 'warn' : 'ok'; }
  function warnings(r) {
    const w = [];
    if (r.net.Ssc / Math.max(r.Sequ, 1) < 33) w.push('Rapporto Ssc/S inverter (Rsce) = ' + fx(r.net.Ssc / r.Sequ, 0) + ' < 33: rete debole, attese elevate distorsioni di tensione.');
    if (S.inverters.some(i => (D.TOPOLOGIES[i.topo] || {}).afe)) w.push('Presenti AFE/inverter PWM: le supraarmoniche 2–150 kHz non sono modellate; verificare compatibilità con strumenti e filtri EMC.');
    if (S.limits.cur === 'iec312' && r.Iin > 75) w.push('IEC 61000-3-12 si applica ad apparecchi ≤ 75 A: per il quadro (' + fx(r.Iin, 0) + ' A) i risultati sono indicativi; valutare anche IEEE 519.');
    if (S.cap.on && S.cap.detune === 0) w.push('Banco di rifasamento senza reattanza di sintonia con carichi non lineari: rischio elevato di risonanza.');
    if (r.peaks.length) w.push('Risonanza parallela individuata attorno a h = ' + r.peaks.map(p => fx(p.h, 1)).join(', ') + '.');
    if (S.method.sum === 'arith') w.push('Somma aritmetica selezionata: risultato prudenziale (caso peggiore).');
    return w;
  }
  function checksTable(r) {
    const rows = r.checks.slice().sort((a, b) => b.util - a.util);
    return `<div class="scroll"><table class="tbl chk"><thead><tr><th>Verifica</th><th>Valore</th><th>Limite</th><th>Utilizzo</th><th>Esito</th></tr></thead><tbody>${rows.map(c => `<tr><td><small>${esc(c.group)}</small><br>${esc(c.label)}<br><em class="muted">${esc(c.hint || '')}</em></td>
      <td>${fx(c.value, c.value >= 100 ? 0 : 2)} ${esc(c.unit)}</td><td>${fx(c.limit, c.limit >= 100 ? 0 : 2)}</td>
      <td><div class="ubar"><i class="st-${c.status}" style="width:${Math.min(c.util, 1.5) / 1.5 * 100}%"></i></div>${fx(c.util * 100, 0)}%</td><td>${badge(c.status)}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function scenTable(R) {
    return `<div class="scroll"><table class="tbl"><thead><tr><th>Scenario</th><th>I1 inverter [A]</th><th>THDi inverter</th><th>THDv</th><th>Utilizzo max</th><th>Esito</th></tr></thead><tbody>${R.scenarios.map(r => `<tr><td>${esc(r.name)}</td>
      <td>${fx(r.I1inv, 0)}</td><td>${fx(r.THDi, 1)}%</td><td>${fx(r.THDv, 2)}%</td><td>${fx(r.worst * 100, 0)}%</td><td>${badge(overall(r))}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function pgRis() {
    const R = results(), wi = worstIdx(R), idx = selScen < 0 || selScen >= R.scenarios.length ? wi : selScen, r = R.scenarios[idx];
    const ch = chartsFor(r), ov = overall(r);
    const tdd = r.checks.find(c => c.id === 'tdd');
    const k = [
      kpi('THDv sbarra', fx(r.THDv, 2), '%', stOf(r, 'thdv')),
      kpi('THDi inverter', fx(r.THDi, 1), '%', 'ok', 'al punto di consegna ' + fx(r.THDiPCC, 1) + '%'),
      tdd ? kpi('TDD (IEEE 519)', fx(tdd.value, 2), '%', tdd.status, 'limite ' + fx(tdd.limit, 1) + '%') : kpi('Rsce', fx(r.rsce, 0), '', 'ok', 'Ssc/S inverter'),
      kpi('Ssc / Icc al quadro', fx(r.net.Ssc / 1e6, 1), 'MVA', 'ok', fx(r.net.Isc / 1000, 1) + ' kA · X/R ' + fx(r.net.xr, 1)),
      r.busRes ? kpi('Sbarra – utilizzo', fx(r.busRes.util * 100, 0), '%', stOf(r, 'busD'), 'declass. armonico ' + fx((1 - r.busRes.kder) * 100, 1) + '%') : '',
      r.trafo ? kpi('Trasformatore', fx(r.trafo.load / r.trafo.Imax * 100, 0), '%', stOf(r, 'trf'), 'K = ' + fx(r.trafo.Kfac, 1)) : ''
    ].join('');
    const sc = R.scenarios.map((s, i) => `<option value="${i}"${i === idx ? ' selected' : ''}>${esc(s.name)}${i === wi ? ' (peggiore)' : ''}</option>`).join('');
    const w = warnings(r);
    return card('Esito complessivo', `<div class="row"><label class="fld"><span>Scenario analizzato</span><select id="scsel">${sc}</select></label>${badge(ov)}
      <span class="muted">Semaforo: OK &lt; ${S.limits.warnPct}% del limite · ATTENZIONE ${S.limits.warnPct}–100% · NON CONFORME &gt; 100%</span></div><div class="kpis">${k}</div>
      ${w.length ? '<ul class="warnl">' + w.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' : ''}`)
      + card('Parametri da attenzionare (ordinati per utilizzo del limite)', CH.hbars({ title: '', rows: r.checks.slice().sort((a, b) => b.util - a.util).slice(0, 10) }) + checksTable(r))
      + card('Grafici', `<div class="charts">${ch.cur}${ch.volt}${ch.imp}${ch.wave}</div>`)
      + card('Confronto scenari', scenTable(R));
  }

  /* ---------------- mitigazioni ---------------- */
  function pgMit() {
    const m = S.mitig, opts = [['', 'Invariato']].concat(Object.keys(D.TOPOLOGIES).filter(k => k !== 'custom').map(k => [k, D.TOPOLOGIES[k].name]));
    const R0 = C.computeAll(S), wi = worstIdx(R0), idx = selScen < 0 || selScen >= R0.scenarios.length ? wi : selScen;
    const S2 = JSON.parse(JSON.stringify(S)); S2.mitig.active = true;
    const R1 = C.computeAll(S2), a = R0.scenarios[idx], b = R1.scenarios[idx];
    const rows = [['THDi inverter [%]', a.THDi, b.THDi, 1], ['THDi al punto di consegna [%]', a.THDiPCC, b.THDiPCC, 1], ['THDv sbarra [%]', a.THDv, b.THDv, 2],
      ['Sbarra distribuzione – utilizzo [%]', a.busRes && a.busRes.util * 100, b.busRes && b.busRes.util * 100, 0],
      ['Trasformatore – utilizzo [%]', a.trafo && a.trafo.load / a.trafo.Imax * 100, b.trafo && b.trafo.load / b.trafo.Imax * 100, 0],
      ['Utilizzo massimo verifiche [%]', Math.max(...a.checks.map(c => c.util)) * 100, Math.max(...b.checks.map(c => c.util)) * 100, 0]];
    return card('Cosa succede se…  (what-if, non modifica il progetto)', `<p class="muted">Sostituisci la topologia di singoli inverter e/o aggiungi un filtro attivo sul quadro. Scenario: <b>${esc(a.name)}</b>.</p>
      <div class="scroll"><table class="tbl"><thead><tr><th>Inverter</th><th>Attuale</th><th>Alternativa</th></tr></thead><tbody>${S.inverters.map((inv, i) => `<tr><td>${esc(inv.name)} ×${inv.qty}</td><td>${esc(D.TOPOLOGIES[inv.topo].name)}</td>
        <td><select data-p="mitig.topo.${inv.id}" data-t="s" data-r="1">${opts.map(([k, l]) => `<option value="${k}"${(m.topo[inv.id] || '') === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table></div>
      <div class="grid4">${F('Filtro attivo sul quadro', 'mitig.af.on', { t: 'chk', r: 1 })}${m.af.on ? F('Corrente nominale di compensazione', 'mitig.af.Ir', { unit: 'A rms' }) + F('Efficacia per armonica', 'mitig.af.eff', { unit: '%' }) + F('Ordine massimo compensato', 'mitig.af.hmax') : ''}</div>`)
      + card('Confronto prima / dopo', `<div class="scroll"><table class="tbl"><thead><tr><th>Indicatore</th><th>Prima</th><th>Dopo</th><th>Variazione</th></tr></thead><tbody>${rows.map(([l, x, y, d]) => `<tr><td>${l}</td><td>${fx(x, d)}</td><td>${fx(y, d)}</td><td>${x != null && y != null ? ((y - x >= 0 ? '+' : '') + fx(y - x, d)) : '—'}</td></tr>`).join('')}</tbody></table></div>
      ${b.afInfo ? `<p class="muted">Filtro attivo: corrente compensata ${fx(b.afInfo.used, 0)} A su ${fx(b.afInfo.Ir, 0)} A di capacità.</p>` : ''}
      <div class="charts">${CH.spectrum({ title: 'Armoniche dopo mitigazione (grigio: attuale)', unit: 'A', vals: b.IhInv.map((x, k) => k >= 2 ? x : 0), vals2: a.IhInv.map((x, k) => k >= 2 ? x : 0) })}</div>`);
  }

  /* ---------------- relazione ---------------- */
  function pgRel() {
    const R = results(), wi = worstIdx(R), r = R.scenarios[wi], ch = chartsFor(r), ov = overall(r);
    const date = new Date().toLocaleDateString('it-IT');
    const net = r.net, invT = S.inverters.map(i => `<tr><td>${esc(i.name)}</td><td>${esc(i.brand)}</td><td>${esc(D.TOPOLOGIES[i.topo].name)}</td><td>${i.Pn}</td><td>${i.qty}</td><td>${i.kSim}</td><td>${i.eta}</td><td>${i.cos}</td></tr>`).join('');
    const specT = '<table class="tbl small"><thead><tr><th>Inverter</th>' + [5, 7, 11, 13, 17, 19, 23, 25, 29, 31].map(h => '<th>h' + h + '</th>').join('') + '<th>THDi</th></tr></thead><tbody>'
      + S.inverters.map(i => { let t = 0; for (let h = 2; h <= 50; h++) t += ((i.spec[h] || 0) ** 2); return `<tr><td>${esc(i.name)}</td>${[5, 7, 11, 13, 17, 19, 23, 25, 29, 31].map(h => '<td>' + (i.spec[h] || 0) + '</td>').join('')}<td>${fx(Math.sqrt(t), 1)}%</td></tr>`; }).join('') + '</tbody></table>';
    const w = warnings(r);
    return `<div class="no-print"><button class="primary" data-act="print">Stampa / salva PDF</button> <button data-act="exportcsv">Esporta CSV risultati</button></div>
    <article class="report">
      <h1>Relazione di calcolo – Armoniche su sbarratura BT ${S.net.V} V</h1>
      <p><b>${esc(S.meta.name)}</b> · Committente: ${esc(S.meta.client) || '—'} · Progettista: ${esc(S.meta.author) || '—'} · Rev. ${esc(S.meta.rev)} · ${date}</p>
      <p>Applicazione: ${esc(D.CONTEXTS[S.context].name)}. Esito complessivo dello scenario peggiore (<b>${esc(r.name)}</b>): ${badge(ov)}</p>
      <h2>1. Dati di rete</h2>
      <p>Origine: ${esc(net.desc)}. Ssc = ${fx(net.Ssc / 1e6, 2)} MVA, Icc = ${fx(net.Isc / 1000, 2)} kA, X/R = ${fx(net.xr, 1)}, Rsce = ${fx(r.rsce, 0)}.
      Rifasamento: ${S.cap.on ? S.cap.Qc + ' kvar, sintonia ' + S.cap.detune + '%' : 'assente'}. Carichi lineari: ${S.linear.P} kW cosφ ${S.linear.cos}.</p>
      <h2>2. Inverter</h2><div class="scroll"><table class="tbl small"><thead><tr><th>Modello</th><th>Costruttore</th><th>Topologia</th><th>Pn kW</th><th>Q.tà</th><th>Cont. %</th><th>η</th><th>cosφ</th></tr></thead><tbody>${invT}</tbody></table></div>
      <h3>Spettri armonici adottati (% I1)</h3><div class="scroll">${specT}</div><p class="muted">${D.REF_SPECTRUM}</p>
      <h2>3. Metodo</h2>
      <ul><li>Corrente fondamentale di ogni inverter: I1 = Pn / (η·√3·V·cosφ1). Armonica h: Ih = n · I1 · (Ih%/100) · k^β.</li>
      <li>Somma fra inverter: ${S.method.sum === 'iec' ? 'IEC/TR 61000-3-6, Ih = (Σ Ihk^α)^(1/α), α = 1 (h&lt;5), 1,4 (5≤h≤10), 2 (h&gt;10)' : S.method.sum === 'arith' ? 'aritmetica' : S.method.sum === 'rss' ? 'quadratica' : 'vettoriale con sfasamenti'}.</li>
      <li>Rete: Zs(h) = R·√h + j·h·X; con carichi lineari e rifasamento in parallelo: Znet(h). Vh = Ih·|Znet(h)|, THDv = √ΣVh² / V1 (fase). Risonanza h<sub>r</sub> ≈ √(Ssc/Qc).</li>
      <li>Sbarra: Rac(h)/Rdc da effetto pelle di conduttore piatto F(ξ) = (ξ/2)(sinh ξ + sin ξ)/(cosh ξ − cos ξ), ξ = t/δ, con maggiorazione di prossimità; fattore di declassamento k = √[R(1) / Σ (Ih/I1)²·R(h)] e fattore ambiente √[(Tmax−Ta)/(Tmax−Tref)].</li>
      <li>Trasformatore: I<sub>max</sub> = √[(1+e)/(1+e·Σ(Ih²h<sup>q</sup>)/ΣIh²)], fattore K = ΣIh²h²/ΣIh² (IEC 61378-1 / IEEE C57.110).</li></ul>
      <h2>4. Risultati – scenario peggiore</h2>${checksTable(r)}
      ${w.length ? '<h3>Avvertenze</h3><ul class="warnl">' + w.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' : ''}
      <div class="charts">${ch.cur}${ch.volt}${ch.imp}${ch.wave}</div>
      <h2>5. Confronto scenari</h2>${scenTable(R)}
      <h2>6. Riferimenti normativi</h2><ul>${D.NORMS.map(n => '<li>' + esc(n) + '</li>').join('')}</ul>
      <h2>7. Avvertenze</h2><p>Il calcolo è uno strumento di supporto basato su modelli semplificati e su spettri tipici di topologia: non sostituisce la verifica di un progettista abilitato, le misure in campo né le prove di tipo (IEC 61439, IEC 61000-3-12, dati del costruttore). Modello di prossimità sulle sbarre, stima della temperatura e forme d\'onda sono indicativi. I limiti normativi sono riportati per consultazione e vanno verificati sull\'edizione vigente.</p>
    </article>`;
  }

  /* ---------------- rendering ---------------- */
  const RENDER = { proj: pgProj, rete: pgRete, sbarra: pgSbarra, inv: pgInv, scen: pgScen, lim: pgLim, ris: pgRis, mit: pgMit, rel: pgRel };
  function renderNav() {
    $('#nav').innerHTML = PAGES.map(([k, l]) => `<button class="${k === page ? 'on' : ''}" data-nav="${k}">${l}</button>`).join('');
  }
  function renderPage() {
    const st = $('#page').scrollTop, y = window.scrollY;
    document.body.dataset.page = page;
    $('#page').innerHTML = RENDER[page]();
    renderNav(); live(); window.scrollTo(0, y);
  }
  function live() {
    const ns = $('#netsum');
    if (ns) { const n = C.netImpedance(S.net); ns.innerHTML = `Ssc al quadro = <b>${fx(n.Ssc / 1e6, 2)} MVA</b> · Icc = <b>${fx(n.Isc / 1000, 2)} kA</b> · X/R = ${fx(n.xr, 1)} · Zk = ${fx(n.Z * 1000, 2)} mΩ`; }
    const bs = $('#bussum');
    if (bs) { const b = C.busFactors(S.bus, S.net.f); bs.innerHTML = `Rdc = ${fx(b.Rdc * 1e6, 2)} µΩ/m per fase · Rac(1)/Rdc = ${fx(b.fac[1], 3)} · Rac(5)/Rdc = ${fx(b.fac[5], 2)} · Rac(11)/Rdc = ${fx(b.fac[11], 2)} · Rac(25)/Rdc = ${fx(b.fac[25], 2)}`; }
    S.inverters.forEach((inv, i) => {
      const el = $('#invsum' + i); if (!el) return;
      const I1 = inv.Pn * 1000 / inv.eta / (Math.sqrt(3) * S.net.V * inv.cos); let t = 0;
      for (let h = 2; h <= 50; h++) t += (inv.spec[h] || 0) ** 2;
      el.innerHTML = `I1 per unità = <b>${fx(I1, 1)} A</b> · totale riga = ${fx(I1 * inv.qty * inv.kSim / 100, 0)} A · THDi spettro = <b>${fx(Math.sqrt(t), 1)} %</b>`;
    });
  }
  let calcT = null;
  function scheduleCalc() {
    live();
    if (page === 'ris' || page === 'mit' || page === 'rel') { clearTimeout(calcT); calcT = setTimeout(renderPage, 250); }
  }

  /* ---------------- eventi ---------------- */
  function onEdit(el) {
    const p = el.dataset.p, t = el.dataset.t; let v;
    if (t === 'b') v = el.checked; else if (t === 'n') { if (el.value === '') return; v = parseFloat(el.value); if (!isFinite(v)) return; }
    else if (t === 'sp') { const h = p.split('.').pop(); const inv = S.inverters[+p.split('.')[1]]; if (el.value === '') delete inv.spec[h]; else inv.spec[h] = Math.max(0, parseFloat(el.value) || 0); persist(); scheduleCalc(); return; }
    else v = el.value;
    if (p.startsWith('mitig.topo.')) { const id = p.slice(11); if (v === '') delete S.mitig.topo[id]; else S.mitig.topo[id] = v; }
    else if (p === 'cap.detune' || p === 'trafoq') set(p, parseFloat(v));
    else set(p, v);
    if (p === 'context') applyContext();
    if (/^inverters\.\d+\.topo$/.test(p)) { const inv = S.inverters[+p.split('.')[1]]; const T = D.TOPOLOGIES[inv.topo]; if (inv.topo !== 'custom') { inv.spec = Object.assign({}, T.spec); inv.cos = T.cos; inv.eta = T.eta; } }
    persist();
    if (el.dataset.r || /\.topo$/.test(p)) renderPage(); else scheduleCalc();
  }
  function applyContext() {
    const c = D.CONTEXTS[S.context]; S.limits.volt = c.volt; S.limits.cur = c.cur; S.limits.thdvTarget = c.thdvTarget;
    if (c.mode) S.net.mode = c.mode;
  }
  function userLib() { try { return JSON.parse(localStorage.getItem(LIBKEY)) || []; } catch (e) { return []; } }
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2600); }
  function addInvToScen(inv) { S.scenarios.forEach(s => s.items[inv.id] = { on: true, load: s.defLoad || 100 }); }
  function download(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: type || 'application/json' })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
  function pickFile(cb) { const i = document.createElement('input'); i.type = 'file'; i.accept = '.json'; i.onchange = () => { const f = i.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => cb(rd.result); rd.readAsText(f); }; i.click(); }

  function act(a, el) {
    const i = +el.dataset.i, j = +el.dataset.j;
    if (a === 'addlib' || a === 'addblank') {
      if (S.inverters.length >= MAXINV) return toast('Massimo ' + MAXINV + ' tipi di inverter');
      let inv;
      const v = $('#libsel') && $('#libsel').value;
      if (a === 'addblank') inv = newInv({ model: 'Nuovo inverter', Pn: 55 }, 'six_choke3');
      else if (v[0] === 'L') inv = newInv(D.LIBRARY[+v.slice(1)]);
      else { const u = userLib()[+v.slice(1)]; inv = newInv(Object.assign({}, u, { model: u.name })); inv.topo = u.topo; inv.spec = Object.assign({}, u.spec); inv.cos = u.cos; inv.eta = u.eta; inv.brand = u.brand; inv.name = u.name; }
      S.inverters.push(inv); addInvToScen(inv);
    } else if (a === 'dup') {
      if (S.inverters.length >= MAXINV) return toast('Massimo ' + MAXINV + ' tipi di inverter');
      const c = JSON.parse(JSON.stringify(S.inverters[i])); c.id = 'i' + (++idc) + '_' + Math.random().toString(36).slice(2, 5); c.name += ' (copia)';
      S.inverters.splice(i + 1, 0, c); addInvToScen(c);
    } else if (a === 'del') {
      if (!confirm('Eliminare questo inverter?')) return;
      const id = S.inverters[i].id; S.inverters.splice(i, 1); S.scenarios.forEach(s => delete s.items[id]); delete S.mitig.topo[id];
    } else if (a === 'applytopo') { const inv = S.inverters[i], T = D.TOPOLOGIES[inv.topo]; inv.spec = Object.assign({}, T.spec); }
    else if (a === 'scale') {
      const inv = S.inverters[i]; let t = 0; for (let h = 2; h <= 50; h++) t += (inv.spec[h] || 0) ** 2; t = Math.sqrt(t);
      const v = parseFloat(prompt('THDi attuale ' + t.toFixed(1) + '%. Nuovo THDi target [%]:', t.toFixed(1)));
      if (!(v > 0) || !(t > 0)) return; for (let h = 2; h <= 50; h++) if (inv.spec[h]) inv.spec[h] = +(inv.spec[h] * v / t).toFixed(3);
    } else if (a === 'savelib') {
      const inv = S.inverters[i], u = userLib(); u.push({ name: inv.name, brand: inv.brand, topo: inv.topo, Pn: inv.Pn, eta: inv.eta, cos: inv.cos, regen: inv.regen, spec: inv.spec });
      localStorage.setItem(LIBKEY, JSON.stringify(u)); toast('Salvato nella libreria utente');
    } else if (a === 'explib') download('libreria-inverter.json', JSON.stringify(userLib(), null, 1));
    else if (a === 'implib') pickFile(t => { try { const n = JSON.parse(t); if (!Array.isArray(n)) throw 0; localStorage.setItem(LIBKEY, JSON.stringify(userLib().concat(n))); renderPage(); toast('Libreria importata'); } catch (e) { toast('File non valido'); } });
    else if (a === 'addscen') { const s = { name: 'Nuovo scenario', defLoad: 100, items: {} }; S.inverters.forEach(v => s.items[v.id] = { on: true, load: 100 }); S.scenarios.push(s); }
    else if (a === 'dupscen') { const c = JSON.parse(JSON.stringify(S.scenarios[j])); c.name += ' (copia)'; S.scenarios.splice(j + 1, 0, c); }
    else if (a === 'delscen') S.scenarios.splice(j, 1);
    else if (a === 'print') { window.print(); return; }
    else if (a === 'exportcsv') return exportCsv();
    persist(); renderPage();
  }
  function exportCsv() {
    const R = results(); let t = 'Scenario;Gruppo;Verifica;Valore;Unita;Limite;Utilizzo %;Esito\n';
    R.scenarios.forEach(r => r.checks.forEach(c => t += [r.name, c.group, c.label, fx(c.value, 3), c.unit, fx(c.limit, 3), fx(c.util * 100, 1), c.status].join(';').replace(/\./g, ',') + '\n'));
    download('risultati-armoniche.csv', '﻿' + t, 'text/csv');
  }

  function init() {
    document.addEventListener('input', e => { const el = e.target; if (el.dataset && el.dataset.p && el.type !== 'checkbox' && el.tagName !== 'SELECT') onEdit(el); });
    document.addEventListener('change', e => {
      const el = e.target;
      if (el.id === 'scsel') { selScen = +el.value; renderPage(); return; }
      if (el.dataset && el.dataset.p && (el.type === 'checkbox' || el.tagName === 'SELECT')) onEdit(el);
    });
    document.addEventListener('click', e => {
      const b = e.target.closest('[data-nav],[data-act],[data-top]'); if (!b) return;
      if (b.dataset.nav) { page = b.dataset.nav; renderPage(); window.scrollTo(0, 0); }
      else if (b.dataset.act) act(b.dataset.act, b);
      else if (b.dataset.top) top(b.dataset.top);
    });
    function top(a) {
      if (a === 'save') download((S.meta.name || 'progetto').replace(/[^\w\-]+/g, '_') + '.armoniche.json', JSON.stringify(S, null, 1));
      else if (a === 'open') pickFile(t => { try { const j = JSON.parse(t); if (j.v !== 1) throw 0; S = j; j.inverters.forEach(i => { const m = /^i(\d+)/.exec(i.id); if (m) idc = Math.max(idc, +m[1]); }); persist(); renderPage(); toast('Progetto caricato'); } catch (e) { toast('File non valido'); } });
      else if (a === 'new') { if (confirm('Creare un nuovo progetto? I dati non salvati andranno persi.')) { S = defaults(); persist(); renderPage(); } }
      else if (a === 'logout') { sessionStorage.removeItem('auth'); location.reload(); }
    }
    renderPage();
  }
  window.App = { init, get state() { return S; } };
})();
