```javascript
/* CONFIG – set these after you deploy Apps Script */
const SCRIPT_URL = https://script.google.com/macros/s/AKfycbw9xgimSjV8He_0sZHAY60_5Oo2TqtVHVspa-5t0EdyrGsOewjIiLop-7FZQPGWLxHx/exec; // paste your deployed Web App URL
const AUTH_TOKEN  = AKfycbw9xgimSjV8He_0sZHAY60_5Oo2TqtVHVspa-5t0EdyrGsOewjIiLop-7FZQPGWLxHx;                  // same token set in Apps Script Properties

/* Simple localization: Gujarati labels only for UI; values saved in English */
const i18n = {
  shiftLabel: s => `વર્તમાન શિફ્ટ: ${s || '?'}`,
};

/* IndexedDB setup */
const DB_NAME = 'icecream_db';
const DB_VER  = 1;
let db;

function openDB(){
  return new Promise((resolve,reject)=>{
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = (e)=>{
      const d = e.target.result;
      if(!d.objectStoreNames.contains('products')){
        const s = d.createObjectStore('products',{keyPath:'id',autoIncrement:true});
      }
      if(!d.objectStoreNames.contains('orders')){
        const s = d.createObjectStore('orders',{keyPath:'transaction_id'});
      }
      if(!d.objectStoreNames.contains('remarks')){
        const s = d.createObjectStore('remarks',{keyPath:'id'});
      }
      if(!d.objectStoreNames.contains('settings')){
        const s = d.createObjectStore('settings',{keyPath:'key'});
      }
      if(!d.objectStoreNames.contains('queue')){
        const s = d.createObjectStore('queue',{keyPath:'id'});
      }
    };
    req.onsuccess = (e)=>{ db=e.target.result; resolve(db); };
    req.onerror   = (e)=> reject(e.target.error);
  });
}

function tx(store,mode='readonly'){ return db.transaction(store,mode).objectStore(store); }

async function setSetting(key,value){ await openDB(); return new Promise((res,rej)=>{ const r=tx('settings','readwrite').put({key,value}); r.onsuccess=()=>res(true); r.onerror=(e)=>rej(e); }); }
async function getSetting(key){ await openDB(); return new Promise((res)=>{ const r=tx('settings').get(key); r.onsuccess=()=>res(r.result?.value); r.onerror=()=>res(undefined); }); }

async function addProduct(p){ await openDB(); return new Promise((res,rej)=>{ const r=tx('products','readwrite').add(p); r.onsuccess=()=>res(r.result); r.onerror=(e)=>rej(e); }); }
async function listProducts(){ await openDB(); return new Promise((res)=>{ const out=[]; const c=tx('products').openCursor(); c.onsuccess=(e)=>{ const cur=e.target.result; if(cur){ out.push(cur.value); cur.continue(); } else res(out); }; }); }

async function putOrder(o){ await openDB(); return new Promise((res,rej)=>{ const r=tx('orders','readwrite').put(o); r.onsuccess=()=>res(true); r.onerror=(e)=>rej(e); }); }
async function listOrders(){ await openDB(); return new Promise((res)=>{ const out=[]; const c=tx('orders').openCursor(); c.onsuccess=(e)=>{ const cur=e.target.result; if(cur){ out.push(cur.value); cur.continue(); } else res(out); }; }); }

async function putRemark(rm){ await openDB(); return new Promise((res,rej)=>{ const r=tx('remarks','readwrite').put(rm); r.onsuccess=()=>res(true); r.onerror=(e)=>rej(e); }); }
async function listRemarks(){ await openDB(); return new Promise((res)=>{ const out=[]; const c=tx('remarks').openCursor(); c.onsuccess=(e)=>{ const cur=e.target.result; if(cur){ out.push(cur.value); cur.continue(); } else res(out); }; }); }

async function enqueue(item){ await openDB(); return new Promise((res,rej)=>{ const r=tx('queue','readwrite').put(item); r.onsuccess=()=>res(true); r.onerror=(e)=>rej(e); }); }
async function listQueue(){ await openDB(); return new Promise((res)=>{ const out=[]; const c=tx('queue').openCursor(); c.onsuccess=(e)=>{ const cur=e.target.result; if(cur){ out.push(cur.value); cur.continue(); } else res(out); }; }); }
async function deleteQueue(id){ await openDB(); return new Promise((res,rej)=>{ const r=tx('queue','readwrite').delete(id); r.onsuccess=()=>res(true); r.onerror=(e)=>rej(e); }); }

/* Helpers */
function uid(){ return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,c=>(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16)); }
function toLocalISO(d=new Date()){
  const tz = -d.getTimezoneOffset();
  const s = tz>=0?'+':'-';
  const hh = String(Math.floor(Math.abs(tz)/60)).padStart(2,'0');
  const mm = String(Math.abs(tz)%60).padStart(2,'0');
  return d.toISOString().replace('Z','')+s+hh+':'+mm;
}
function formatMoney(n){ return (Math.round(Number(n)*100)/100).toFixed(2); }

/* UI wiring */
const el = sel => document.querySelector(sel);
const els = sel => [...document.querySelectorAll(sel)];

function switchTab(target){
  els('.tab').forEach(b=>b.classList.toggle('active', b.dataset.target===target));
  els('.page').forEach(p=>p.classList.toggle('active', '#'+p.id===target));
}

document.addEventListener('click', (e)=>{
  const t=e.target.closest('.tab'); if(t){ switchTab(t.dataset.target); }
});

/* Service worker */
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('./sw.js');
  });
}

/* State */
let PRODUCTS=[];
let QTY={}; // {productId: qty}

async function refreshProducts(){
  PRODUCTS = await listProducts();
  renderProducts();
  renderAdminProducts();
}

function renderProducts(){
  const wrap = el('#productList');
  wrap.innerHTML='';
  if(!PRODUCTS.length){ wrap.innerHTML='<div class="muted">ઉત્પાદનો ઉમેરો (Owner page)</div>'; return; }
  for(const p of PRODUCTS){
    if(!(p.id in QTY)) QTY[p.id]=0;
    const card = document.createElement('div');
    card.className='card product';
    card.innerHTML = `
      <div class="img">${p.photo?`<img src="${p.photo}" alt="${p.name_en}" style="width:100%;height:100%;object-fit:cover;"/>`:'📷'}</div>
      <div style="flex:1">
        <div><span class="swatch" style="background:${p.color_hex||'#334155'}"></span><strong>${p.name_gu||p.name_en}</strong></div>
        <div class="muted">₹ ${formatMoney(p.price)}</div>
        <div class="qty" style="margin-top:.35rem">
          <button data-act="dec" data-id="${p.id}">-</button>
          <span id="q_${p.id}">${QTY[p.id]}</span>
          <button data-act="inc" data-id="${p.id}">+</button>
        </div>
      </div>`;
    wrap.appendChild(card);
  }
  wrap.addEventListener('click', onQtyClick);
  updateBasketSummary();
}

function onQtyClick(e){
  const b=e.target.closest('button');
  if(!b||!b.dataset.id) return;
  const id=Number(b.dataset.id);
  if(b.dataset.act==='inc') QTY[id]=(QTY[id]||0)+1;
  if(b.dataset.act==='dec') QTY[id]=Math.max(0,(QTY[id]||0)-1);
  const span=el('#q_'+id); if(span) span.textContent=QTY[id];
  updateBasketSummary();
}

function updateBasketSummary(){
  let total=0, items=0;
  for(const p of PRODUCTS){
    const q=QTY[p.id]||0; if(q>0){ items+=q; total+=q*Number(p.price); }
  }
  el('#basketSummary').textContent = items? `${items} વસ્તુ | ₹ ${formatMoney(total)}` : 'કોઈ વસ્તુ પસંદ નથી';
}

/* Save order */
async function saveOrder(){
  const device = await getSetting('device_name');
  const shift  = await getSetting('current_shift');
  if(!device){ alert('પહેલાં Device Name સેટ કરો (Owner > Device Name)'); switchTab('#products'); return; }
  if(!shift){ alert('પહેલાં શિફ્ટ પસંદ કરો'); switchTab('#shift'); return; }

  const items=[]; let total=0;
  for(const p of PRODUCTS){
    const q=QTY[p.id]||0; if(q>0){
      const lt = Number(p.price)*q; total+=lt;
      items.push({product_id:String(p.id), product_name_en:p.name_en, qty:q, unit_price:Number(p.price), line_total:lt});
    }
  }
  if(!items.length){ alert('કોઈ વસ્તુ પસંદ નથી'); return; }

  const order={
    transaction_id: uid(),
    device_name: device,
    shift,
    timestamp_iso: toLocalISO(new Date()),
    total_amount: Number(total),
    items,
    synced:false
  };

  await putOrder(order);
  await enqueue({ id:uid(), type:'order', payload: order });

  // reset qty
  QTY={}; renderProducts();
  alert('ઓર્ડર સેવ થયો');
  refreshSales();
}

/* Admin page */
async function unlockProducts(){
  const pwd = el('#unlockPwd').value;
  if(pwd==='Ashish@987'){
    const until = Date.now()+60*60*1000; // 1h unlock
    await setSetting('unlocked_until', until);
    el('#addProductBtn').disabled=false;
    el('#deviceNameBtn').disabled=false;
    alert('Unlocked');
    el('#modalUnlock').close();
  } else {
    alert('ખોટો પાસવર્ડ');
  }
}

async function checkUnlock(){
  const until = await getSetting('unlocked_until');
  const ok = until && Date.now()<Number(until);
  el('#addProductBtn').disabled = !ok;
  el('#deviceNameBtn').disabled = !ok;
}

function renderAdminProducts(){
  const wrap=el('#adminProductList');
  wrap.innerHTML='';
  for(const p of PRODUCTS){
    const row=document.createElement('div'); row.className='card';
    row.innerHTML=`<div><strong>${p.name_en}</strong> ${p.name_gu?`<span class="muted">(${p.name_gu})</span>`:''} – ₹ ${formatMoney(p.price)} <span class="swatch" style="background:${p.color_hex||'#334155'}"></span></div>`;
    wrap.appendChild(row);
  }
}

/* Device name */
async function saveDeviceName(){
  const v=el('#deviceNameInput').value.trim(); if(!v){ alert('Enter device name'); return; }
  await setSetting('device_name', v);
  el('#deviceNameView').textContent = 'Device: '+v;
  el('#modalDeviceName').close();
}

/* Shift */
async function setShift(s){ await setSetting('current_shift', s); updateShiftBadge(); alert('શિફ્ટ સેટ થઈ'); }
async function updateShiftBadge(){ const s=await getSetting('current_shift'); el('#currentShiftBadge').textContent=i18n.shiftLabel(s); el('#remarkShift').value=s||'A'; }

/* Sales page */
async function refreshSales(){
  const orders = await listOrders();
  // filters
  const fShift = el('#filterShift').value;
  const fFrom  = el('#filterFrom').value? new Date(el('#filterFrom').value+'T00:00:00') : null;
  const fTo    = el('#filterTo').value? new Date(el('#filterTo').value+'T23:59:59') : null;

  let view = orders.slice().sort((a,b)=> new Date(b.timestamp_iso)-new Date(a.timestamp_iso));
  if(fShift) view=view.filter(o=>o.shift===fShift);
  if(fFrom)  view=view.filter(o=> new Date(o.timestamp_iso)>=fFrom);
  if(fTo)    view=view.filter(o=> new Date(o.timestamp_iso)<=fTo);

  // table
  const tb=el('#salesTable tbody'); tb.innerHTML='';
  let grand=0, count=view.length, pending=0;
  for(const o of view){
    grand+=Number(o.total_amount);
    if(!o.synced) pending++;
    const tr=document.createElement('tr');
    const itemsTxt=o.items.map(i=>`${i.product_name_en} x${i.qty}`).join(', ');
    tr.innerHTML=`
      <td>${o.timestamp_iso.replace('T',' ')}</td>
      <td>${o.device_name}</td>
      <td>${o.shift}</td>
      <td>${itemsTxt}</td>
      <td>₹ ${formatMoney(o.total_amount)}</td>
      <td>${o.synced?'✅':'⏳'}</td>`;
    tb.appendChild(tr);
  }
  el('#sumTotal').textContent = formatMoney(grand);
  el('#countOrders').textContent = count;
  el('#pendingSync').textContent = pending;

  // chart: totals by shift for current filtered set
  const byShift = {A:0,B:0,C:0};
  for(const o of view){ byShift[o.shift]=(byShift[o.shift]||0)+Number(o.total_amount); }
  drawBarChart('salesChart', ['A','B','C'], [byShift.A||0, byShift.B||0, byShift.C||0]);
}

function drawBarChart(canvasId, labels, values){
  const c=document.getElementById(canvasId); const ctx=c.getContext('2d');
  const W=c.width, H=c.height; ctx.clearRect(0,0,W,H);
  const max=Math.max(1,...values); const pad=30; const bw=(W-2*pad)/values.length*0.6; const gap=(W-2*pad)/values.length*0.4;
  // axes
  ctx.strokeStyle='#294368'; ctx.beginPath(); ctx.moveTo(pad,10); ctx.lineTo(pad,H-pad); ctx.lineTo(W-10,H-pad); ctx.stroke();
  // bars
  for(let i=0;i<values.length;i++){
    const x=pad + i*(bw+gap) + gap/2; const h=(H-2*pad)*(values[i]/max); const y=H-pad-h;
    ctx.fillStyle='#0ea5e9'; ctx.fillRect(x,y,bw,h);
    ctx.fillStyle='#cbd5e1'; ctx.textAlign='center'; ctx.fillText(labels[i], x+bw/2, H-pad+14);
    ctx.fillText('₹'+formatMoney(values[i]), x+bw/2, y-4);
  }
}

/* Sync */
async function syncNow(){
  const q = await listQueue();
  if(!q.length){ alert('કાંઈ પેન્ડિંગ નથી'); return; }

  // group by type
  const orders = q.filter(x=>x.type==='order');
  const remarks = q.filter(x=>x.type==='remark');

  // send orders as rows (each item becomes a row with same transaction_id)
  for(const item of orders){
    const o = item.payload;
    const rows = o.items.map(it=>({
      device_name:o.device_name,
      shift:o.shift,
      timestamp_iso:o.timestamp_iso,
      transaction_id:o.transaction_id,
      product_id: it.product_id,
      product_name_en: it.product_name_en,
      qty: it.qty,
      unit_price: it.unit_price,
      line_total: it.line_total
    }));
    const ok = await postToScript({type:'order', rows});
    if(ok){
      // mark order as synced and remove from queue
      o.synced=true; await putOrder(o); await deleteQueue(item.id);
    }
  }

  for(const item of remarks){
    const r=item.payload;
    const rows=[{
      device_name:r.device_name,
      shift:r.shift,
      timestamp_iso:r.timestamp_iso,
      remark_id:r.id,
      name_en:r.name_en,
      remarks_text_en:r.text_en
    }];
    const ok = await postToScript({type:'remark', rows});
    if(ok){ await deleteQueue(item.id); }
  }

  await refreshSales();
  alert('સિંક પૂર્ણ');
}

async function postToScript(body){
  try{
    const resp = await fetch(SCRIPT_URL,{
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${AUTH_TOKEN}` },
      body: JSON.stringify(body)
    });
    if(!resp.ok) return false;
    const json=await resp.json();
    return json.success===true;
  }catch(e){ return false; }
}

/* Remarks */
async function saveRemark(e){
  e.preventDefault();
  const device = await getSetting('device_name');
  const name_en = el('#remarkName').value.trim();
  const shift   = el('#remarkShift').value;
  const text_en = el('#remarkText').value.trim();
  if(!device) return alert('પહેલાં Device Name સેટ કરો');
  if(!name_en || !text_en) return alert('Name અને Remark જરૂરી છે');
  const rec={ id:uid(), device_name:device, shift, name_en, text_en, timestamp_iso: toLocalISO(new Date()) };
  await putRemark(rec);
  await enqueue({ id:uid(), type:'remark', payload: rec });
  el('#remarkForm').reset();
  renderRemarks();
  alert('Remark saved');
}

async function renderRemarks(){
  const list = await listRemarks();
  const wrap = el('#remarksList'); wrap.innerHTML='';
  for(const r of list.sort((a,b)=> new Date(b.timestamp_iso)-new Date(a.timestamp_iso))){
    const row=document.createElement('div'); row.className='card';
    row.innerHTML=`<div><strong>${r.name_en}</strong> – ${r.shift} – <span class="muted">${r.timestamp_iso.replace('T',' ')}</span></div><div class="muted">${r.text_en}</div>`;
    wrap.appendChild(row);
  }
}

/* Init */
async function bootstrap(){
  await openDB();
  // Device name display
  const dn = await getSetting('device_name'); if(dn) el('#deviceNameView').textContent='Device: '+dn;
  // Shift badge
  await updateShiftBadge();
  // Products
  await refreshProducts();
  // Sales
  await refreshSales();
  // Remarks
  await renderRemarks();
}

document.addEventListener('DOMContentLoaded', ()=>{
  // Buttons
  el('#saveOrderBtn').addEventListener('click', saveOrder);
  el('#syncBtn').addEventListener('click', syncNow);
  el('#applyFiltersBtn').addEventListener('click', refreshSales);

  // Unlock
  el('#unlockProductsBtn').addEventListener('click', ()=> el('#modalUnlock').showModal());
  el('#unlockDo').addEventListener('click', unlockProducts);
  el('#addProductBtn').addEventListener('click', ()=> el('#modalAddProduct').showModal());
  el('#deviceNameBtn').addEventListener('click', ()=> el('#modalDeviceName').showModal());
  checkUnlock();

  // Add product save
  el('#addProductSave').addEventListener('click', async ()=>{
    const name_en = el('#p_name_en').value.trim();
    const name_gu = el('#p_name_gu').value.trim();
    const price   = parseFloat(el('#p_price').value);
    const color   = el('#p_color').value.trim() || '#334155';
    const file    = el('#p_photo').files[0];
    if(!name_en || isNaN(price)){ alert('Name EN અને Price જરૂરી છે'); return; }
    let photo=null;
    if(file){ photo = await fileToDataURL(file); }
    await addProduct({ name_en, name_gu, price, color_hex: color, photo });
    el('#modalAddProduct').close();
    el('#p_name_en').value=''; el('#p_name_gu').value=''; el('#p_price').value=''; el('#p_color').value=''; el('#p_photo').value='';
    refreshProducts();
  });

  // Device name save
  el('#deviceNameSave').addEventListener('click', saveDeviceName);

  // Shift buttons
  els('.shiftBtn').forEach(b=> b.addEventListener('click', ()=> setShift(b.dataset.shift)) );

  // Remarks
  el('#remarkForm').addEventListener('submit', saveRemark);

  bootstrap();
});

function fileToDataURL(file){
  return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(file); });