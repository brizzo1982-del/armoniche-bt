/* Motore di calcolo armoniche BT – nessuna dipendenza dal DOM. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./data.js'));
  else root.Calc = factory(root.Data);
})(typeof self !== 'undefined' ? self : this, function (D) {
  'use strict';
  const SQ3 = Math.sqrt(3), HMAX = 50;
  const MU0 = 4 * Math.PI * 1e-7;

  /* ---- numeri complessi [re, im] ---- */
  const cx = (a, b) => [a, b || 0];
  const cadd = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
  const cinv = a => { const d = a[0] * a[0] + a[1] * a[1]; return [a[0] / d, -a[1] / d]; };
  const cdiv = (a, b) => cmul(a, cinv(b));
  const cabs = a => Math.hypot(a[0], a[1]);
  const carg = a => Math.atan2(a[1], a[0]);

  const alphaIEC = h => h < 5 ? 1 : (h <= 10 ? 1.4 : 2);

  /* angolo di fase della corrente armonica per un convertitore sfasato di theta° */
  function harmAngle(h, thetaDeg) {
    const th = (thetaDeg || 0) * Math.PI / 180;
    if (h % 2 === 1 && h % 3 !== 0) return Math.round(h / 6) * 6 * th; // 6k±1
    return h * th;
  }

  function combine(list, method, h) {
    if (!list.length) return 0;
    if (method === 'arith') return list.reduce((s, x) => s + x.m, 0);
    if (method === 'rss') return Math.sqrt(list.reduce((s, x) => s + x.m * x.m, 0));
    if (method === 'vec') {
      let re = 0, im = 0;
      list.forEach(x => { re += x.m * Math.cos(x.a); im += x.m * Math.sin(x.a); });
      return Math.hypot(re, im);
    }
    const al = alphaIEC(h);
    return Math.pow(list.reduce((s, x) => s + Math.pow(x.m, al), 0), 1 / al);
  }

  /* ---- impedenza di cortocircuito al quadro ---- */
  function netImpedance(n) {
    const V = n.V;
    let R, X, desc = '';
    if (n.mode === 'icc') {
      const Z = V / (SQ3 * n.Ik * 1000), xr = n.xr || 5;
      R = Z / Math.sqrt(1 + xr * xr); X = R * xr; desc = 'Icc trifase assegnata';
    } else if (n.mode === 'gen') {
      const Sn = n.gen.Sn * 1000, Z = (n.gen.xd / 100) * V * V / Sn, xr = n.gen.xr || 15;
      R = Z / Math.sqrt(1 + xr * xr); X = R * xr; desc = 'Gruppo elettrogeno (Xd\'\')';
    } else {
      const xr = n.xrMV || 10, Zg = V * V / (n.sscMV * 1e6);
      const Rg = Zg / Math.sqrt(1 + xr * xr), Xg = Rg * xr;
      const Sn = n.trafo.Sn * 1000, Ztr = (n.trafo.uk / 100) * V * V / Sn;
      const Rtr = n.trafo.Pcu * V * V / (Sn * Sn);
      const Xtr = Math.sqrt(Math.max(Ztr * Ztr - Rtr * Rtr, 0));
      R = Rg + Rtr + n.link.R / 1000; X = Xg + Xtr + n.link.X / 1000;
      desc = 'Rete MT + trasformatore + collegamento';
    }
    const Z = Math.hypot(R, X);
    return { R, X, Z, Ssc: V * V / Z, Isc: V / (SQ3 * Z), xr: X / R, desc };
  }

  /* ---- modello di rete armonico ---- */
  function makeNetModel(S, net) {
    const V = S.net.V, cap = S.cap || {};
    const capOn = !!(cap.on && cap.Qc > 0);
    const p = (cap.detune || 0) / 100;
    let Xc = 0, XL = 0, Rcap = 0;
    if (capOn) {
      Xc = V * V / (cap.Qc * 1000 * (1 - p)); XL = p * Xc;
      Rcap = 0.002 * Xc + (p > 0 ? XL / 30 : 0);
    }
    const lin = S.linear || {};
    const Pl = (lin.P || 0) * 1000, cosl = lin.cos || 0.85;
    const Ql = Pl * Math.tan(Math.acos(Math.min(Math.max(cosl, 0.1), 1)));
    const Yload = h => {
      let y = cx(0, 0);
      if (Pl > 0) y = cadd(y, cx(Pl / (V * V), 0));
      if (Ql > 0) y = cadd(y, cinv(cx(0, h * V * V / Ql)));
      return y;
    };
    const Zs = h => cx(net.R * Math.sqrt(h), h * net.X);
    const Zc = h => capOn ? cx(Rcap, h * XL - Xc / h) : null;
    const Zn = h => {
      let y = cinv(Zs(h));
      const zc = Zc(h); if (zc) y = cadd(y, cinv(zc));
      y = cadd(y, Yload(h));
      return cinv(y);
    };
    const Zpar = h => { // carico + condensatore (senza sorgente)
      let y = Yload(h); const zc = Zc(h); if (zc) y = cadd(y, cinv(zc));
      return (y[0] === 0 && y[1] === 0) ? null : cinv(y);
    };
    return { capOn, Zs, Zc, Zn, Zpar, Pl, Ql, Xc, XL };
  }

  /* ---- resistenza c.a. sbarra rettangolare (Rac/Rdc) ---- */
  function skinFlat(xi) {
    if (xi < 1e-3) return 1;
    if (xi > 30) return xi / 2;
    return (xi / 2) * (Math.sinh(xi) + Math.sin(xi)) / (Math.cosh(xi) - Math.cos(xi));
  }
  function busFactors(bus, f) {
    const M = D.MATERIALS[bus.mat] || D.MATERIALS.Cu;
    const rho = M.rho20 * (1 + M.alpha * ((bus.Top || 90) - 20));
    const t = bus.t / 1000, N = Math.max(bus.n || 1, 1);
    const cp = (bus.cp != null ? bus.cp : 0.35) * (1 + 0.15 * (N - 1));
    const fac = [0];
    for (let h = 1; h <= HMAX; h++) {
      const delta = Math.sqrt(rho / (Math.PI * f * h * MU0));
      const F = skinFlat(t / delta);
      fac[h] = 1 + (F - 1) * (1 + cp);
    }
    return { fac, rho, Rdc: rho / (N * (bus.w / 1000) * t) };
  }
  function cableFactors(cab, f) {
    const M = D.MATERIALS[cab.mat] || D.MATERIALS.Cu;
    const rho = M.rho20 * (1 + M.alpha * 70), S = cab.S * 1e-6, Rp = rho / S;
    const dc = Math.sqrt(4 * S / Math.PI), ratio = 1 / 1.3; // dc/s con cavi a contatto
    const fac = [0];
    for (let h = 1; h <= HMAX; h++) {
      const ff = f * h, xs2 = (8 * Math.PI * ff / Rp) * 1e-7 * 1.0, xs4 = xs2 * xs2;
      const ys = xs4 / (192 + 0.8 * xs4);
      const xp2 = (8 * Math.PI * ff / Rp) * 1e-7 * 0.8, xp4 = xp2 * xp2;
      const g = xp4 / (192 + 0.8 * xp4);
      const yp = g * ratio * ratio * (0.312 * ratio * ratio + 1.18 / (g + 0.27));
      fac[h] = 1 + ys + yp;
    }
    return { fac };
  }
  function thermalCheck(facs, I1, Ih, In, Ta, Tmax, Tref) {
    const R1 = facs[1];
    let sum = R1, sq = 1;
    for (let h = 2; h <= HMAX; h++) {
      const r = (Ih[h] || 0) / I1; if (!(I1 > 0)) break;
      sum += r * r * facs[h]; sq += r * r;
    }
    const kder = Math.sqrt(R1 / sum);
    const kTa = Math.sqrt(Math.max(Tmax - Ta, 0) / Math.max(Tmax - Tref, 1));
    const Iallow = In * kder * kTa;
    const ratio = (I1 * I1 * sum) / (In * In * R1);
    return { kder, kTa, Iallow, util: I1 / Iallow, Irms: I1 * Math.sqrt(sq),
             Tstim: Ta + (Tmax - Tref) * ratio, lossRatio: sum / R1 };
  }

  const statusOf = (u, warn) => u > 1 ? 'ko' : (u >= warn ? 'warn' : 'ok');

  /* ---- calcolo di uno scenario ---- */
  function compute(S, scenIdx, opts) {
    opts = opts || {};
    const V = S.net.V, f = S.net.f, Vph = V / SQ3;
    const scen = S.scenarios[scenIdx] || S.scenarios[0];
    const mit = S.mitig && S.mitig.active ? S.mitig : null;
    const method = S.method.sum, beta = S.method.beta;
    const warn = (S.limits.warnPct || 80) / 100;
    const mods = S.modules;
    const net = netImpedance(S.net);
    const model = makeNetModel(S, net);

    // ---- gruppi di inverter
    const groups = [];
    let Pinv = 0, Qinv = 0, Sequ = 0;
    const lists = []; for (let h = 0; h <= HMAX; h++) lists.push([]);
    S.inverters.forEach(inv => {
      const it = (scen.items || {})[inv.id] || { on: true, load: 100 };
      const k = (it.load || 0) / 100;
      if (!it.on || k <= 0) return;
      const T = mit && mit.topo && mit.topo[inv.id] ? D.TOPOLOGIES[mit.topo[inv.id]] : null;
      const spec = T ? T.spec : inv.spec, cos = T ? T.cos : inv.cos, eta = T ? T.eta : inv.eta;
      const Pin = inv.Pn * 1000 / eta;
      const I1n = Pin / (SQ3 * V * cos);
      const n = inv.qty * (inv.kSim / 100);
      const Pg = n * Pin * k, Qg = Pg * Math.tan(Math.acos(cos));
      Pinv += Pg; Qinv += Qg; Sequ += n * SQ3 * V * I1n;
      const Ih = [];
      for (let h = 2; h <= HMAX; h++) {
        const m = n * I1n * ((spec[h] || 0) / 100) * Math.pow(k, beta);
        Ih[h] = m;
        if (m > 0) lists[h].push({ m, a: harmAngle(h, inv.theta) });
      }
      groups.push({ id: inv.id, name: inv.name, n, k, I1: n * I1n * k, P: Pg / 1000, Ih });
    });
    const I1inv = Math.hypot(Pinv, Qinv) / (SQ3 * V);
    const IhInv = [0, 0];
    for (let h = 2; h <= HMAX; h++) IhInv[h] = combine(lists[h], method, h);

    // ---- filtro attivo (what-if)
    let afInfo = null;
    const IhPre = IhInv.slice();
    if (mit && mit.af && mit.af.on && mit.af.Ir > 0) {
      let used = 0; const eff = (mit.af.eff || 90) / 100;
      for (let h = 2; h <= Math.min(HMAX, mit.af.hmax || 49); h++) {
        const want = eff * IhInv[h], room = Math.sqrt(Math.max(mit.af.Ir * mit.af.Ir - used, 0));
        const c = Math.min(want, room); used += c * c; IhInv[h] -= c;
      }
      afInfo = { used: Math.sqrt(used), Ir: mit.af.Ir };
    }

    // ---- fondamentale
    const lin = S.linear || {};
    const Pl = (lin.P || 0) * 1000, Ql = model.Ql;
    const Pt = Pinv + Pl, Qd = Qinv + Ql;
    const Qc = model.capOn ? S.cap.Qc * 1000 : 0;
    const Idist = Math.hypot(Pt, Qd) / (SQ3 * V);
    const Iin = Math.hypot(Pt, Qd - Qc) / (SQ3 * V);

    // ---- rete: tensioni e correnti
    const Vh = [], Vloc = [], Is = [], Ic = [], gain = [], Zabs = [], ZsAbs = [];
    const bgIn = S.net.bg || {};
    for (let h = 2; h <= HMAX; h++) {
      const Zn = model.Zn(h), Zs = model.Zs(h), Zc = model.Zc(h);
      const I = IhInv[h];
      Vloc[h] = I * cabs(Zn);
      const kS = cabs(cdiv(Zn, Zs));
      Is[h] = I * kS;
      Ic[h] = Zc ? I * cabs(cdiv(Zn, Zc)) : 0;
      gain[h] = kS; Zabs[h] = cabs(Zn); ZsAbs[h] = cabs(Zs);
      // tensione di fondo a monte
      const bgp = (bgIn[h] || 0) / 100 * Vph;
      let vbg = bgp;
      const Zp = model.Zpar(h);
      if (bgp > 0 && Zp) { vbg = bgp * cabs(cdiv(Zp, cadd(Zs, Zp))); if (Zc) Ic[h] += vbg / cabs(Zc); }
      const al = alphaIEC(h);
      Vh[h] = Math.pow(Math.pow(Vloc[h], al) + Math.pow(vbg, al), 1 / al);
      Vloc[h] = Vloc[h];
    }
    let sv = 0, svl = 0, si = 0, sis = 0, sic = 0;
    for (let h = 2; h <= HMAX; h++) { sv += Vh[h] ** 2; svl += Vloc[h] ** 2; si += IhInv[h] ** 2; sis += Is[h] ** 2; sic += Ic[h] ** 2; }
    const THDv = Math.sqrt(sv) / Vph * 100, THDvLocal = Math.sqrt(svl) / Vph * 100;
    const THDi = I1inv > 0 ? Math.sqrt(si) / I1inv * 100 : 0;
    const THDiPCC = I1inv > 0 ? Math.sqrt(sis) / I1inv * 100 : 0;
    let pw = 0; for (let h = 14; h <= 40; h++) pw += h * (Is[h] / (I1inv || 1)) ** 2;
    const PWHD = Math.sqrt(pw) * 100;

    // ---- risonanza (scansione)
    const scan = { h: [], Zn: [], Zs: [] };
    for (let h = 1; h <= HMAX + 1e-9; h += 0.1) {
      scan.h.push(+h.toFixed(2)); scan.Zn.push(cabs(model.Zn(h)) * 1000); scan.Zs.push(cabs(model.Zs(h)) * 1000);
    }
    const peaks = [];
    for (let i = 1; i < scan.h.length - 1; i++) {
      const g = scan.Zn[i] / scan.Zs[i];
      if (g > 1.2 && scan.Zn[i] > scan.Zn[i - 1] && scan.Zn[i] >= scan.Zn[i + 1]) peaks.push({ h: scan.h[i], gain: g });
    }

    const checks = [];
    const add = c => { c.status = statusOf(c.util, warn); checks.push(c); };

    // ---- tensione
    if (mods.thdv) {
      const set = S.limits.volt, cust = S.limits.vcustom;
      const lim = D.voltThd(set, cust);
      add({ id:'thdv', group:'Tensione sbarra', label:'THDv sulla sbarra', value:THDv, unit:'%', limit:lim, util:THDv / lim,
            hint:'Limite del set selezionato (' + (D.VOLT_SETS[set] || {}).name + ').' });
      if (S.limits.thdvTarget > 0) add({ id:'thdvT', group:'Tensione sbarra', label:'THDv vs obiettivo di progetto', value:THDv, unit:'%', limit:S.limits.thdvTarget, util:THDv / S.limits.thdvTarget,
            hint:'Obiettivo prudenziale suggerito dall\'applicazione.' });
      let wu = 0, wh = 0;
      for (let h = 2; h <= HMAX; h++) { const l = D.voltLimit(set, h, cust), u = (Vh[h] / Vph * 100) / l; if (u > wu) { wu = u; wh = h; } }
      add({ id:'vh', group:'Tensione sbarra', label:'Armonica singola peggiore (h=' + wh + ')', value:Vh[wh] / Vph * 100, unit:'%',
            limit:D.voltLimit(set, wh, cust), util:wu, hint:'Ordine più prossimo al proprio limite.' });
    }

    // ---- corrente al PCC
    let IL = 0, ratioSc = 0, rsce = Sequ > 0 ? net.Ssc / Sequ : Infinity;
    if (mods.thdi) {
      if (S.limits.cur === 'ieee519') {
        IL = S.limits.IL > 0 ? S.limits.IL : (opts.IL > 0 ? opts.IL : Iin);
        ratioSc = net.Isc / IL;
        const row = D.ieeeRow(ratioSc), tdd = Math.sqrt(sis) / IL * 100;
        add({ id:'tdd', group:'Corrente al PCC', label:'TDD (IEEE 519, Isc/IL=' + ratioSc.toFixed(0) + ')', value:tdd, unit:'%', limit:row.tdd, util:tdd / row.tdd,
              hint:'IL = corrente di carico massima (' + IL.toFixed(0) + ' A).' });
        let wu = 0, wh = 0;
        for (let h = 2; h <= HMAX; h++) { const l = D.ieeeLimit(h, ratioSc), u = (Is[h] / IL * 100) / l; if (u > wu) { wu = u; wh = h; } }
        add({ id:'ih', group:'Corrente al PCC', label:'Corrente armonica singola peggiore (h=' + wh + ')', value:Is[wh] / IL * 100, unit:'% IL',
              limit:D.ieeeLimit(wh, ratioSc), util:wu, hint:'Armoniche pari limitate al 25% delle dispari.' });
      } else if (S.limits.cur === 'iec312') {
        const L = D.iec312Limits(rsce);
        const pct = h => I1inv > 0 ? Is[h] / I1inv * 100 : 0;
        [['THD', THDiPCC], ['PWHD', PWHD], ['I5', pct(5)], ['I7', pct(7)], ['I11', pct(11)], ['I13', pct(13)]].forEach(([k, v]) =>
          add({ id:'c312' + k, group:'Corrente al PCC', label:'IEC 61000-3-12 – ' + (k === 'THD' ? 'THD' : k === 'PWHD' ? 'PWHD' : 'h' + k.slice(1)) + ' (Rsce=' + (isFinite(rsce) ? rsce.toFixed(0) : '∞') + ')',
                value:v, unit:'% I1', limit:L[k], util:v / L[k], hint:'Norma per apparecchi ≤75 A: uso indicativo per quadri maggiori.' }));
      }
    }

    // ---- sbarra
    let busRes = null, busInc = null, bf = null;
    if (mods.busbar) {
      bf = busFactors(S.bus, f);
      busRes = thermalCheck(bf.fac, Idist, IhPre.map(x => x), S.bus.In, S.bus.Ta, S.bus.Tmax, S.bus.Tref || 35);
      busInc = thermalCheck(bf.fac, Iin, Is, S.bus.In, S.bus.Ta, S.bus.Tmax, S.bus.Tref || 35);
      add({ id:'busD', group:'Sbarratura', label:'Sbarra di distribuzione – I1 / I ammissibile (con armoniche)', value:Idist, unit:'A', limit:busRes.Iallow, util:busRes.util,
            hint:'Fattore di declassamento armonico ' + busRes.kder.toFixed(3) + ', ambiente ' + busRes.kTa.toFixed(3) + '.' });
      add({ id:'busI', group:'Sbarratura', label:'Sbarra di arrivo – I1 / I ammissibile (con armoniche)', value:Iin, unit:'A', limit:busInc.Iallow, util:busInc.util,
            hint:'Considera la compensazione del rifasamento e le correnti armoniche verso rete.' });
      add({ id:'busT', group:'Sbarratura', label:'Temperatura stimata sbarra (distribuzione)', value:busRes.Tstim, unit:'°C', limit:S.bus.Tmax, util:(busRes.Tstim - S.bus.Ta) / Math.max(S.bus.Tmax - S.bus.Ta, 1),
            hint:'Stima lineare delle perdite: indicativa (IEC 61439-1 cl. 10.10).' });
    }
    // neutro
    let neutral = null;
    if (mods.busbar && S.bus.neutralOn) {
      let s3 = 0; groups.forEach(g => { for (let h = 3; h <= HMAX; h += 6) s3 += (3 * g.Ih[h]) ** 2; });
      neutral = Math.sqrt(s3);
      const iz = S.bus.In * (S.bus.neutralPct || 50) / 100;
      add({ id:'neu', group:'Sbarratura', label:'Corrente di neutro (triplette, somma aritmetica)', value:neutral, unit:'A', limit:iz, util:neutral / iz, hint:'Solo se presenti carichi monofase (neutro distribuito).' });
    }

    // ---- trasformatore
    let trafo = null;
    if (mods.trafo && S.net.trafo.Sn > 0 && S.net.mode !== 'gen') {
      let num = Iin * Iin, den = Iin * Iin; const q = S.trafoq || 1.7;
      for (let h = 2; h <= HMAX; h++) { num += Is[h] ** 2 * Math.pow(h, q); den += Is[h] ** 2; }
      let k2 = Iin * Iin; for (let h = 2; h <= HMAX; h++) k2 += Is[h] ** 2 * h * h;
      const Kq = num / den, Kfac = k2 / den, e = (S.net.trafo.pec || 8) / 100;
      const Imax = Math.sqrt((1 + e) / (1 + Kq * e));
      const Irms = Math.sqrt(den), In = S.net.trafo.Sn * 1000 / (SQ3 * V), load = Irms / In;
      trafo = { Kfac, Imax, load, Irms, In };
      add({ id:'trf', group:'Trasformatore', label:'Carico RMS / corrente ammissibile con armoniche', value:load * 100, unit:'% In', limit:Imax * 100, util:load / Imax,
            hint:'Fattore K = ' + Kfac.toFixed(2) + ' ; derating ' + ((1 - Imax) * 100).toFixed(1) + '% (q=' + q + ', PEC-R=' + (e * 100).toFixed(0) + '%).' });
    }

    // ---- cavo di alimentazione
    let cable = null;
    if (mods.cable && S.cable.on) {
      const cf = cableFactors(S.cable, f), np = Math.max(S.cable.np || 1, 1);
      cable = thermalCheck(cf.fac, Iin / np, Is.map(x => x / np), S.cable.Iz, 30, 30, 30);
      add({ id:'cab', group:'Cavo di arrivo', label:'Cavo – I1 per conduttore / Iz con armoniche', value:Iin / np, unit:'A', limit:cable.Iallow, util:cable.util,
            hint:'Iz già corretta per posa (IEC 60364-5-52). Fattore armonico ' + cable.kder.toFixed(3) + '.' });
    }

    // ---- condensatori e risonanza
    let capRes = null;
    if (mods.reson && model.capOn) {
      const Icn = S.cap.Qc * 1000 / (SQ3 * V), Irms = Math.sqrt(Icn * Icn + sic), lim = S.cap.ilim || 1.3;
      capRes = { Icn, Irms };
      add({ id:'cap', group:'Rifasamento / risonanza', label:'Corrente RMS condensatori / In', value:Irms / Icn, unit:'×In', limit:lim, util:Irms / Icn / lim, hint:'IEC 60831: tipicamente ≤ 1,3·In.' });
    }
    if (mods.reson) {
      let wu = 0, wh = 0;
      [5, 7, 11, 13, 17, 19, 23, 25].forEach(h => {
        if (I1inv > 0 && IhPre[h] / I1inv < 0.005) return;
        const u = gain[h] / 2; if (u > wu) { wu = u; wh = h; }
      });
      if (wh) add({ id:'res', group:'Rifasamento / risonanza', label:'Amplificazione |Znet/Zs| all\'armonica critica h=' + wh, value:gain[wh], unit:'×', limit:2, util:wu,
                    hint:peaks.length ? 'Picco di risonanza parallelo vicino a h=' + peaks.map(p => p.h.toFixed(1)).join(', ') : 'Nessun picco rilevante.' });
    }

    // ---- forma d'onda indicativa
    const sgn = h => { const m = h % 12; return (m === 5 || m === 7) ? -1 : 1; };
    const wave = { t: [], i: [], v: [] };
    const NPT = 240;
    for (let n = 0; n <= NPT; n++) {
      const x = 2 * Math.PI * n / NPT;
      let iv = I1inv * Math.sin(x), vv = Vph * Math.sin(x);
      for (let h = 2; h <= HMAX; h++) {
        iv += sgn(h) * IhInv[h] * Math.sin(h * x);
        const ph = carg(model.Zn(h));
        vv += sgn(h) * Vh[h] * Math.sin(h * x + ph);
      }
      wave.t.push(n / NPT * 360); wave.i.push(iv * Math.SQRT2); wave.v.push(vv * Math.SQRT2);
    }

    return { name: scen.name, net, model: { capOn: model.capOn }, groups, I1inv, Idist, Iin, Pt, Qd, Qc, Sequ, rsce,
      IhInv, IhPre, Is, Ic, Vh, Vloc, gain, THDv, THDvLocal, THDi, THDiPCC, PWHD, scan, peaks,
      busRes, busInc, busFac: bf, neutral, trafo, cable, capRes, afInfo, IL, ratioSc, checks, wave, Vph };
  }

  function computeAll(S, opts) {
    opts = opts || {};
    let IL = 0;
    if (S.limits.cur === 'ieee519' && !(S.limits.IL > 0)) {
      S.scenarios.forEach((s, i) => { const r = compute(S, i, { IL: 0 }); IL = Math.max(IL, r.Iin); });
    }
    const out = S.scenarios.map((s, i) => compute(S, i, { IL }));
    return { scenarios: out, IL };
  }

  return { compute, computeAll, netImpedance, harmAngle, combine, skinFlat, busFactors, cableFactors, alphaIEC, HMAX, statusOf };
});
