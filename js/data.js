/* Dati normativi, topologie, libreria inverter. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Data = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const REF_SPECTRUM = 'Spettro TIPICO di topologia (letteratura: IEEE 519 Annex, IEC 61800-3, IEC 61000-3-12). Non è un dato di catalogo: sostituire con il test report del costruttore.';

  /* Topologie: spettro in % di I1 (corrente fondamentale), ordini 2..50 */
  const TOPOLOGIES = {
    six_nochoke: { name: '6 impulsi, senza reattanza', thdi: 'THDi ~80%', cos: 0.90, eta: 0.97,
      spec: {5:68,7:44,11:9,13:6.5,17:4.2,19:3.4,23:2.3,25:1.9,29:1.4,31:1.2,35:0.9,37:0.8,41:0.65,43:0.6,47:0.5,49:0.45} },
    six_choke3: { name: '6 impulsi + reattanza 3% (AC o DC)', thdi: 'THDi ~40%', cos: 0.94, eta: 0.97,
      spec: {5:36,7:15,11:6,13:4.5,17:2.5,19:2,23:1.2,25:1,29:0.8,31:0.7,35:0.5,37:0.45,41:0.35,43:0.3,47:0.25,49:0.25} },
    six_dcac: { name: '6 impulsi + reattanza DC + AC ~4%', thdi: 'THDi ~30%', cos: 0.96, eta: 0.97,
      spec: {5:27,7:9.5,11:6.2,13:4.2,17:2.4,19:1.9,23:1.2,25:1,29:0.7,31:0.6,35:0.45,37:0.4,41:0.3,43:0.3,47:0.2,49:0.2} },
    six_ahf: { name: '6 impulsi + filtro passivo armonico (AHF)', thdi: 'THDi ~10%', cos: 0.98, eta: 0.96,
      spec: {5:7.5,7:5,11:3.5,13:2.5,17:1.2,19:1,23:0.6,25:0.5,29:0.3,31:0.3} },
    p12: { name: '12 impulsi (trasformatore sfasatore)', thdi: 'THDi ~10%', cos: 0.97, eta: 0.96,
      spec: {5:2.5,7:1.8,11:7.5,13:5.5,17:0.9,19:0.7,23:2.5,25:2,29:0.4,31:0.3,35:1.1,37:0.9,47:0.5,49:0.45} },
    p18: { name: '18 impulsi', thdi: 'THDi ~5%', cos: 0.97, eta: 0.95,
      spec: {5:1.8,7:1.4,11:1.1,13:0.9,17:3.2,19:2.6,23:0.6,25:0.5,35:1.3,37:1.1} },
    p24: { name: '24 impulsi', thdi: 'THDi ~4%', cos: 0.97, eta: 0.95,
      spec: {5:1.5,7:1.2,11:0.8,13:0.7,17:0.6,19:0.5,23:2.6,25:2.2,47:1,49:0.9} },
    lhd: { name: 'Low Harmonic Drive (filtro attivo/passivo integrato)', thdi: 'THDi <5%', cos: 0.99, eta: 0.96,
      spec: {5:2.5,7:1.8,11:1.2,13:1,17:0.7,19:0.6,23:0.4,25:0.35,29:0.25,31:0.2} },
    afe: { name: 'AFE – Active Front End (IGBT + filtro LCL)', thdi: 'THDi ~3%', cos: 1.0, eta: 0.96, afe: true,
      spec: {5:1.8,7:1.4,11:0.9,13:0.7,17:0.5,19:0.4,23:0.3,25:0.25,29:0.2,31:0.2} },
    pv: { name: 'Inverter fotovoltaico / generazione', thdi: 'THDi ~2%', cos: 1.0, eta: 0.98, afe: true, regen: true,
      spec: {2:0.3,3:0.8,5:1.2,7:0.9,9:0.4,11:0.6,13:0.5,17:0.3,19:0.3,23:0.2,25:0.2} },
    ups6: { name: 'UPS 6 impulsi (tiristori) senza filtro', thdi: 'THDi ~30%', cos: 0.92, eta: 0.94,
      spec: {5:28,7:13,11:7.5,13:5.5,17:3,19:2.5,23:1.8,25:1.5,29:1.2,31:1} },
    ups12: { name: 'UPS 12 impulsi con filtro', thdi: 'THDi ~6%', cos: 0.95, eta: 0.94,
      spec: {5:2.5,7:2,11:4,13:3,23:1,25:0.8} },
    custom: { name: 'Personalizzata', thdi: '—', cos: 0.95, eta: 0.97, spec: {} }
  };

  /* Libreria modelli (famiglie indicative: verificare codice e opzioni effettive) */
  const LIBRARY = [
    { brand:'Schneider Electric', model:'Altivar Process ATV630/ATV930 (reattanza DC integrata)', topo:'six_dcac', Pn:55 },
    { brand:'Schneider Electric', model:'Altivar Process ATV680/ATV980 (versione low-harmonic / AFE, verificare codice)', topo:'afe', Pn:132 },
    { brand:'Schneider Electric', model:'Altivar ATV340 / ATV320 (6p con reattanza)', topo:'six_choke3', Pn:11 },
    { brand:'ABB', model:'ACS580-01 (6p con reattanza)', topo:'six_choke3', Pn:90 },
    { brand:'ABB', model:'ACS880-01 (6p con reattanza DC)', topo:'six_dcac', Pn:160 },
    { brand:'ABB', model:'ACS880-11 (low harmonic, rigenerativo)', topo:'lhd', Pn:160, regen:true },
    { brand:'ABB', model:'ACS880-31 (ultra-low harmonic, AFE)', topo:'afe', Pn:160, regen:true },
    { brand:'Danfoss', model:'VLT AutomationDrive FC 302 (6p + reattanza DC)', topo:'six_dcac', Pn:110 },
    { brand:'Danfoss', model:'VLT HVAC Drive FC 102 (6p + reattanza DC)', topo:'six_dcac', Pn:75 },
    { brand:'Danfoss', model:'VLT FC 302 + filtro passivo AHF 010', topo:'six_ahf', Pn:110 },
    { brand:'Danfoss', model:'VLT Low Harmonic Drive (LHD)', topo:'lhd', Pn:160 },
    { brand:'Danfoss', model:'VLT 12-pulse', topo:'p12', Pn:250 },
    { brand:'Nidec', model:'Control Techniques Unidrive M700 (6p con reattanza)', topo:'six_choke3', Pn:110 },
    { brand:'Nidec', model:'Control Techniques Unidrive M Regen (AFE)', topo:'afe', Pn:110, regen:true },
    { brand:'Nidec', model:'Leroy-Somer Powerdrive F300 (6p con reattanza)', topo:'six_choke3', Pn:75 },
    { brand:'Nidec', model:'Nidec Industrial Solutions – azionamento 18 impulsi (taglie elevate)', topo:'p18', Pn:500 },
    { brand:'Generico', model:'Convertitore 6 impulsi senza reattanza', topo:'six_nochoke', Pn:30 },
    { brand:'Generico', model:'Convertitore 24 impulsi', topo:'p24', Pn:800 },
    { brand:'Generico', model:'Inverter fotovoltaico', topo:'pv', Pn:100, regen:true },
    { brand:'Generico', model:'UPS 6 impulsi senza filtro', topo:'ups6', Pn:100 },
    { brand:'Generico', model:'UPS 12 impulsi con filtro', topo:'ups12', Pn:200 }
  ];

  /* Limiti di tensione (% di V1) */
  const even = (a,b,c) => ({2:a,4:b,6:c,8:c,10:c,12:0.2});
  const VOLT_SETS = {
    'iec24c1': { name:'IEC 61000-2-4 Classe 1 (apparecchiature sensibili)', thd:5,
      odd:{5:3,7:3,11:3,13:3,17:2,19:1.5,23:1.5,25:1.5}, tri:{3:3,9:1.5,15:0.3,21:0.2}, ev:even(2,1,0.5) },
    'iec24c2': { name:'IEC 61000-2-4 Classe 2 (reti pubbliche / livello compatibilità)', thd:8,
      odd:{5:6,7:5,11:3.5,13:3,17:2,19:1.5,23:1.5,25:1.5}, tri:{3:5,9:1.5,15:0.4,21:0.3}, ev:even(2,1,0.5) },
    'iec24c3': { name:'IEC 61000-2-4 Classe 3 (ambienti industriali)', thd:10,
      odd:{5:8,7:7,11:5,13:4.5,17:4,19:4,23:3.5,25:3.5}, tri:{3:6,9:2.5,15:2,21:1.75}, ev:{2:3,4:1.5,6:1,8:1,10:1,12:1} },
    'en50160': { name:'EN 50160 (BT, 95% su 10 min)', thd:8,
      odd:{5:6,7:5,11:3.5,13:3,17:2,19:1.5,23:1.5,25:1.5}, tri:{3:5,9:1.5,15:0.5,21:0.5}, ev:{2:2,4:1,6:0.5,8:0.5,10:0.5,12:0.5} },
    'ieee519': { name:'IEEE 519-2022 (V ≤ 1 kV: THD 8%, singola 5%)', thd:8, flat:5 },
    'marine':  { name:'Naviglio/offshore – tipico società di classifica (THD 5%, singola 3%)', thd:5, flat:3 },
    'custom':  { name:'Personalizzato', thd:5, flat:3 }
  };
  function voltLimit(set, h, custom) {
    const s = VOLT_SETS[set] || VOLT_SETS.iec24c2;
    if (set === 'custom' && custom) return h === 1 ? custom.thd : custom.flat;
    if (s.flat) return s.flat;
    if (h % 2 === 0) return s.ev[h] != null ? s.ev[h] : 0.2;
    if (h % 3 === 0) return s.tri[h] != null ? s.tri[h] : 0.2;
    if (s.odd[h] != null) return s.odd[h];
    return h > 25 ? 0.2 + 12.5 / h : 1.5;
  }
  function voltThd(set, custom) {
    return (set === 'custom' && custom) ? custom.thd : (VOLT_SETS[set] || VOLT_SETS.iec24c2).thd;
  }

  /* IEEE 519-2022 Tab.2 (120 V – 69 kV): limiti corrente armonica % IL (armoniche dispari) */
  const IEEE_ROWS = [
    { max:20,   v:[4,2,1.5,0.6,0.3],  tdd:5 },
    { max:50,   v:[7,3.5,2.5,1,0.5],  tdd:8 },
    { max:100,  v:[10,4.5,4,1.5,0.7], tdd:12 },
    { max:1000, v:[12,5.5,5,2,1],     tdd:15 },
    { max:Infinity, v:[15,7,6,2.5,1.4], tdd:20 }
  ];
  function ieeeRow(ratio) { return IEEE_ROWS.find(r => ratio < r.max); }
  function ieeeLimit(h, ratio) {
    const r = ieeeRow(ratio);
    const bin = h < 11 ? 0 : h < 17 ? 1 : h < 23 ? 2 : h < 35 ? 3 : 4;
    return h % 2 === 0 ? r.v[bin] * 0.25 : r.v[bin];
  }

  /* IEC 61000-3-12 Tab.3 (apparecchi trifase equilibrati), % di I1 – interpolazione su Rsce */
  const IEC312 = [
    { r:33,  I5:10.7, I7:7.2, I11:3.1, I13:2,  THD:13, PWHD:22 },
    { r:66,  I5:14,   I7:9,   I11:5,   I13:3,  THD:16, PWHD:25 },
    { r:120, I5:19,   I7:12,  I11:7,   I13:4,  THD:22, PWHD:28 },
    { r:250, I5:31,   I7:20,  I11:12,  I13:7,  THD:37, PWHD:38 },
    { r:350, I5:40,   I7:25,  I11:15,  I13:10, THD:48, PWHD:46 }
  ];
  function iec312Limits(rsce) {
    if (rsce <= IEC312[0].r) return IEC312[0];
    const L = IEC312[IEC312.length - 1];
    if (rsce >= L.r) return L;
    for (let i = 0; i < IEC312.length - 1; i++) {
      const a = IEC312[i], b = IEC312[i + 1];
      if (rsce >= a.r && rsce <= b.r) {
        const t = (rsce - a.r) / (b.r - a.r), o = {};
        ['I5','I7','I11','I13','THD','PWHD'].forEach(k => o[k] = a[k] + t * (b[k] - a[k]));
        return o;
      }
    }
  }

  /* Contesti applicativi: preselezionano limiti e consigli */
  const CONTEXTS = {
    industria: { name:'Impianto industriale (utente BT con trasformatore proprio)',
      volt:'iec24c3', cur:'ieee519', thdvTarget:6,
      tips:['Verifica in tensione: IEC 61000-2-4 Classe 3 è il riferimento interno di stabilimento; per apparecchiature sensibili (PLC, strumentazione) puntare a Classe 2 (THDv ≤ 8%) o all\'obiettivo di progetto.',
            'Verifica in corrente al PCC con IEEE 519 (TDD); in Italia il PCC è tipicamente sul lato MT: usare Ssc e IL del punto di consegna reale.',
            'Con più azionamenti 6 impulsi: valutare reattanza 3–5%, sfasamento con trasformatori Dy/Yy, o AFE/LHD sulle potenze maggiori.',
            'Controllare sempre la presenza di rifasamento: i banchi non detuned sono la causa più frequente di guasti per risonanza.'],
      attention:['Rapporto Ssc/S inverter (Rsce) < 33–50: rete debole → THDv elevato','Banchi di rifasamento senza reattanza di sintonizzazione','Derating trasformatore (K-factor) > 10%'] },
    terziario: { name:'Terziario / commerciale / edifici',
      volt:'en50160', cur:'iec312', thdvTarget:5,
      tips:['Riferimento di tensione: EN 50160 / IEC 61000-2-2; obiettivo di progetto consigliato THDv ≤ 5% sul quadro per carichi elettronici sensibili.',
            'Limiti di corrente per apparecchi: IEC 61000-3-12 (≤75 A per apparecchio) come indicazione; per quadri > 75 A usare IEEE 519 come criterio complementare.',
            'Per HVAC/pompe a velocità variabile preferire drive con reattanza DC+AC o filtri AHF; con molti drive piccoli la somma è prossima all\'aritmetica.'],
      attention:['Neutro sovraccarico se presenti carichi monofase (triplette)','Rifasamento non detuned','Linee lunghe da trasformatore: Ssc ridotta'] },
    critico: { name:'Data center / ospedale / carichi critici',
      volt:'iec24c1', cur:'ieee519', thdvTarget:3,
      tips:['Riferimento IEC 61000-2-4 Classe 1 (THDv ≤ 5%) con obiettivo di progetto ≤ 3% sulle sbarre critiche.',
            'Consigliati AFE / LHD / UPS con raddrizzatore IGBT; evitare 6 impulsi senza filtro.',
            'Verificare la compatibilità con gruppi elettrogeni: la Ssc del generatore (Xd\'\') è bassa e amplifica THDv: usare la modalità "gruppo elettrogeno" in Rete.',
            'Supraarmoniche 2–150 kHz degli AFE non sono modellate: verificare compatibilità con strumentazione (IEC 61000-2-2 / -2-4).'],
      attention:['THDv sulle sbarre critiche > 5%','Funzionamento da generatore (Xd\'\' alto)','Risonanza con filtri EMC / condensatori'] },
    navale: { name:'Naviglio / offshore',
      volt:'marine', cur:'ieee519', thdvTarget:4,
      tips:['Le società di classifica (DNV, RINA, LR, ABS) richiedono tipicamente THDv ≤ 5% con singola ≤ 3% al sistema di bordo: verificare l\'edizione vigente delle regole.',
            'Reti di bordo con Ssc bassa (generatori): THDv rapidamente elevata con azionamenti 6 impulsi; valutare 12/18 impulsi o AFE.',
            'Verificare derating dell\'alternatore e fattore K dei trasformatori di distribuzione.'],
      attention:['Rete debole (generatori)','Sommatoria con propulsori ad alta potenza','Sfasamenti da trasformatori a 12/18 impulsi'] },
    pv: { name:'Generazione / fotovoltaico / accumuli',
      volt:'en50160', cur:'iec312', thdvTarget:5,
      tips:['Limiti sulle emissioni dell\'inverter: IEC 61000-3-12 (≤75 A) e prescrizioni del gestore di rete / CEI 0-21 (verificare edizione vigente).',
            'THDi tipico degli inverter PV a pieno carico ≤ 3%, ma peggiora a carico parziale: usare il fattore β di scala sul carico parziale.',
            'Con rete debole la tensione di fondo e la risonanza con filtri LCL possono dominare.'],
      attention:['Funzionamento a carico parziale (THDi% maggiore)','Risonanza LCL / rete','Sovratensioni da iniezione'] },
    isola: { name:'Rete in isola / gruppo elettrogeno',
      volt:'iec24c3', cur:'ieee519', thdvTarget:8, mode:'gen',
      tips:['Con alternatore la reattanza subtransitoria Xd\'\' (10–20%) determina Ssc molto bassa: i THDv di 15–25% sono tipici con 6 impulsi senza filtro.',
            'Limitare la quota di carico non lineare (< 30–40% di Sn) oppure usare AFE / 12-18 impulsi / filtri attivi.',
            'Declassare l\'alternatore (derating per armoniche e per perdite nel ferro) e verificare l\'AVR.'],
      attention:['Quota non lineare > 30% di Sn gen','THDv > 10%','Interferenza AVR'] },
    custom: { name:'Personalizzato', volt:'iec24c2', cur:'ieee519', thdvTarget:5,
      tips:['Seleziona manualmente i limiti nella sezione "Limiti & metodo".'], attention:[] }
  };

  const MATERIALS = {
    Cu: { name:'Rame', rho20:1.724e-8, alpha:0.00393 },
    Al: { name:'Alluminio', rho20:2.826e-8, alpha:0.00403 }
  };

  const NORMS = [
    'IEC 61000-2-2 / IEC 61000-2-4: livelli di compatibilità (tensione).',
    'EN 50160: caratteristiche della tensione nelle reti pubbliche.',
    'IEC/TR 61000-3-6: valutazione dei limiti di emissione; legge di sommatoria con esponente α (1; 1,4; 2).',
    'IEC 61000-3-12: limiti di corrente per apparecchi con corrente > 16 A e ≤ 75 A per fase (Rsce).',
    'IEEE Std 519-2022: limiti di tensione e corrente (TDD) al PCC.',
    'IEC 61800-3: azionamenti elettrici a velocità variabile – EMC.',
    'IEC 61439-1/-2: quadri BT – verifica dei limiti di sovratemperatura (cl. 10.10).',
    'IEC 61378-1 / IEEE C57.110: trasformatori con carichi non lineari (derating, fattore K).',
    'IEC 60287-1-1: resistenza in c.a. dei conduttori (effetto pelle e prossimità).',
    'IEC 60831 / IEC 60871: condensatori di rifasamento e sovracorrenti armoniche.',
    'CEI 0-21 / CEI 0-16: regole tecniche di connessione (verificare edizione vigente).'
  ];

  return { TOPOLOGIES, LIBRARY, VOLT_SETS, voltLimit, voltThd, IEEE_ROWS, ieeeRow, ieeeLimit,
           IEC312, iec312Limits, CONTEXTS, MATERIALS, NORMS, REF_SPECTRUM };
});
