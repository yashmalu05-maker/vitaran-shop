/* The shop's ordering page (Shop ordering link add-on). Opened from the link a distributor sends on WhatsApp:
   shop.html#t=<token>. No login: the token is the key. Everything comes from two server functions
   (supabase/vitaran_portal.sql): vs_portal_get (this shop's rates, offers, stock level, balance, orders) and
   vs_portal_order (checks, prices and saves the order). The total shown here is worked out the same way as on
   the server (schemes as in www/extra.js); the server's figure is the one saved. */
(function(){
const cfg=window.GSM_CONFIG||{};
const BASE=String(cfg.LIC_URL||cfg.SUPABASE_URL||'').replace(/\/$/,'')+'/rest/v1/rpc/',KEY=cfg.LIC_KEY||cfg.SUPABASE_ANON_KEY||'';
const tokenOf=()=>{const h=location.hash.replace(/^#/,''),q=new URLSearchParams(h.includes('=')?h:'t='+h).get('t')||new URLSearchParams(location.search).get('t')||'';return q.trim()};
const TOK=tokenOf(),SK='vs-shop-'+TOK.slice(0,12);
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>{const n=parseFloat(String(v??'').replace(/,/g,''));return isFinite(n)?n:0};
const r2=n=>Math.round((n+Number.EPSILON)*100)/100,r6=n=>Math.round(n*1e6)/1e6;
const inr=n=>{const v=r2(+n||0);return (v<0?'−':'')+'₹'+Math.abs(v).toLocaleString('en-IN',{minimumFractionDigits:Number.isInteger(v)?0:2,maximumFractionDigits:2})};
const qtxt=n=>(Math.round(n*1000)/1000).toLocaleString('en-IN');
const dshow=d=>d?new Date(d+'T12:00:00').toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short'}):'';
const lsGet=k=>{try{return localStorage.getItem(k)}catch(e){return null}},lsSet=(k,v)=>{try{v==null?localStorage.removeItem(k):localStorage.setItem(k,v)}catch(e){}};
let _tt;function toast(m){const t=$('#toast');t.textContent=m;t.hidden=false;clearTimeout(_tt);_tt=setTimeout(()=>t.hidden=true,3800)}

async function rpc(fn,args){let r;
  try{r=await fetch(BASE+fn,{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+KEY,'Content-Type':'application/json'},body:JSON.stringify(args)})}
  catch(e){const x=new Error('No internet. Check the connection and try again.');x.net=true;throw x}
  const t=await r.text();let j=null;try{j=JSON.parse(t)}catch(e){}
  if(!r.ok){const m=String((j&&j.message)||'Something went wrong. Please try again.'),k=(m.match(/^([A-Z]+): /)||[])[1]||'';const x=new Error(m.replace(/^[A-Z]+: /,''));x.kind=k;x.net=r.status>=500||r.status===0;throw x}
  return j}

/* ---------- state ---------- */
const V={d:null,tab:'shop',find:'',brand:'',cart:{},note:'',err:null,done:null,busy:false};
try{const c=JSON.parse(lsGet(SK+'-cart')||'{}');if(c&&typeof c==='object')V.cart=c}catch(e){}
const saveCart=()=>lsSet(SK+'-cart',Object.keys(V.cart).length?JSON.stringify(V.cart):null);
const P=id=>(V.d.products||[]).find(p=>p.id===id);
const uPer=(p,alt)=>alt&&p.alt?num(p.alt.per):1;
const uName=(p,alt)=>alt&&p.alt?p.alt.unit:p.base;
const uRate=(p,alt)=>alt&&p.alt?r2(p.rate*num(p.alt.per)):p.rate;
// a scheme running for this shop (first match, as the apps do)
const schemeFor=line=>(V.d.offers||[]).find(s=>(s.pid&&s.pid===line.pid)||(!s.pid&&s.brand&&s.brand===line.brand));
function offerText(s){const what=s.pid?(s.pname||'this item'):'all '+s.brand;
  return s.type==='free'?`Buy ${s.min} get ${s.free} free · ${what}`:s.type==='disc'?`${s.value}% off${num(s.min)>1?` on ${s.min} or more`:''} · ${what}`:`₹${s.value} off each${num(s.min)>1?` on ${s.min} or more`:''} · ${what}`}
// the cart as order lines (base unit), then schemes: discounts change the rate, free goods are lines at ₹0
function lines(){const out=[],notes=[];
  const base=Object.entries(V.cart).map(([pid,c])=>{const p=P(pid),q=num(c.q);if(!p||!(q>0))return null;return {pid,name:p.name,brand:p.brand,qty:c.alt&&p.alt?r6(q*num(p.alt.per)):q,typed:q,alt:!!(c.alt&&p.alt),rate:p.rate}}).filter(Boolean)
    .sort((a,b)=>(a.brand+a.name).localeCompare(b.brand+b.name));
  for(const l0 of base){const l={...l0,listRate:l0.rate},s=schemeFor(l),mn=num(s&&s.min);
    if(s&&l.qty>=(mn||1)){
      if(s.type==='disc'){l.rate=r2(l.listRate*(1-num(s.value)/100));notes.push(`${l.name}: ${s.value}% off`)}
      else if(s.type==='off'){l.rate=Math.max(0,r2(l.listRate-num(s.value)));notes.push(`${l.name}: ₹${s.value} off each`)}
      out.push(l);
      if(s.type==='free'&&mn>0){const fq=Math.floor(l.qty/mn)*num(s.free);if(fq>0){out.push({pid:l.pid,name:l.name,brand:l.brand,qty:fq,rate:0,free:true});notes.push(`${l.name}: ${qtxt(fq)} free`)}}
    }else out.push(l)}
  return {out,notes,total:r2(out.reduce((a,l)=>a+l.qty*l.rate,0)),n:base.length}}
const cartN=()=>Object.values(V.cart).filter(c=>num(c.q)>0).length;

/* ---------- screens ---------- */
const STEP={booked:1,billed:2,out:3,delivered:4};
const STW={booked:'Booked',billed:'Billed',out:'Out for delivery',delivered:'Delivered',missed:'Not delivered',cancelled:'Cancelled'};
function head(){const d=V.d,f=d.firm||{},b=num(d.balance),ph=String(f.phone||'').replace(/\D/g,'').slice(-10);
  return `<div class="top"><div class="wrap">${ph.length===10?`<a class="call" href="tel:+91${ph}">Call</a>`:''}<p class="firm">${esc(f.name||'Your distributor')}</p><div class="for">Order for <b>${esc(d.shop.name)}</b>${d.shop.area?' · '+esc(d.shop.area):''}</div></div></div>
  <div class="wrap"><div class="bal"><div><div class="l">${b>0.005?'Your balance due':b<-0.005?'Your advance':'Your balance'}</div><div class="v ${b>0.005?'due':'ok'}" id="bal">${b>0.005||b<-0.005?inr(Math.abs(b)):'Nothing due'}</div></div><div class="s">as on<br>${esc(dshow(d.today))}</div></div>
  <div class="tabs" role="tablist"><button type="button" role="tab" data-tab="shop" class="${V.tab==='shop'?'on':''}">Order</button><button type="button" role="tab" data-tab="cart" class="${V.tab==='cart'?'on':''}">My cart${cartN()?`<span class="n">${cartN()}</span>`:''}</button><button type="button" role="tab" data-tab="orders" class="${V.tab==='orders'?'on':''}">My orders</button></div>`}
function prodRow(p){const c=V.cart[p.id]||{},alt=!!(c.alt&&p.alt),out=p.stock==='out',has=num(c.q)>0,s=schemeFor({pid:p.id,brand:p.brand});
  const tag=p.stock==='out'?'<span class="tag out">Out of stock</span>':p.stock==='few'?'<span class="tag few">Few left</span>':p.stock==='in'?'<span class="tag in">In stock</span>':'';
  return `<div class="prod ${has?'has':''} ${out?'out':''}" data-p="${esc(p.id)}"><div class="nm"><b>${esc(p.name)}</b><div class="pr">${inr(uRate(p,alt))} <small>/ ${esc(uName(p,alt))}</small></div>
    ${tag}${s?`<span class="tag off">${esc(offerText(s).split(' · ')[0])}</span>`:''}
    ${p.alt&&!out?`<div><span class="units" role="group" aria-label="Unit for ${esc(p.name)}"><button type="button" data-u="${esc(p.id)}" data-alt="" class="${alt?'':'on'}">${esc(p.base)}</button><button type="button" data-u="${esc(p.id)}" data-alt="1" class="${alt?'on':''}">${esc(p.alt.unit)}</button></span></div>`:''}</div>
    ${out?'':has?`<div class="qty"><button type="button" data-step="-1" data-id="${esc(p.id)}" aria-label="One less ${esc(p.name)}">−</button><input type="number" inputmode="decimal" min="0" step="any" data-q="${esc(p.id)}" value="${esc(c.q)}" aria-label="Quantity of ${esc(p.name)} in ${esc(uName(p,alt))}"><button type="button" data-step="1" data-id="${esc(p.id)}" aria-label="One more ${esc(p.name)}">+</button></div>`
      :`<button type="button" class="add" data-step="1" data-id="${esc(p.id)}" aria-label="Add ${esc(p.name)}">Add</button>`}</div>`}
function listHtml(){const f=V.find.toLowerCase().trim().split(/\s+/).filter(Boolean),ps=(V.d.products||[]).filter(p=>(!V.brand||p.brand===V.brand)&&f.every(w=>(p.name+' '+p.brand).toLowerCase().includes(w)));
  if(!ps.length)return `<div class="empty">${(V.d.products||[]).length?'No item matches. Check the spelling.':'No items to order yet. Please call your distributor.'}</div>`;
  let h='',last=null;for(const p of ps.slice(0,400)){if(p.brand!==last){h+=`<div class="brand">${esc(p.brand)}</div>`;last=p.brand}h+=prodRow(p)}
  return h+(ps.length>400?`<p class="mut" style="text-align:center">Showing 400 of ${ps.length}. Search to find more.</p>`:'')}
function shopView(){const d=V.d,brands=[...new Set((d.products||[]).map(p=>p.brand))];
  return `${(d.offers||[]).length?`<h2>Offers for you</h2><div class="offers">${d.offers.map(s=>`<div class="offer"><b>${esc(s.name)}</b><span>${esc(offerText(s))}${s.to?` · till ${esc(dshow(s.to))}`:''}</span></div>`).join('')}</div>`:''}
  <div class="find"><input type="search" id="find" placeholder="Search ${(d.products||[]).length.toLocaleString('en-IN')} items" aria-label="Search items" value="${esc(V.find)}" autocomplete="off">
  ${brands.length>1?`<div class="chips"><button type="button" data-brand="" class="${V.brand?'':'on'}">All</button>${brands.map(b=>`<button type="button" data-brand="${esc(b)}" class="${V.brand===b?'on':''}">${esc(b)}</button>`).join('')}</div>`:''}</div>
  <div id="plist">${listHtml()}</div>`}
function cartView(){const L=lines();
  if(V.done)return `<div class="card done"><div class="ok">✓</div><b style="font-size:20px">Order placed</b><p>Your order of <b>${inr(V.done.total)}</b> has reached ${esc(V.d.firm.name)}.${V.done.again?' (It was already placed.)':''}</p><p class="mut">See it in My orders. The bill comes from your distributor.</p><button type="button" class="ghost" data-tab="orders">See my orders</button> <button type="button" class="ghost" data-act="again">Order more</button></div>`;
  if(!L.n)return `<div class="empty"><b>Your cart is empty.</b><br>Tap Add on the items you need.</div><div style="text-align:center"><button type="button" class="ghost" data-tab="shop">Choose items</button></div>`;
  return `<div class="card">${L.out.map(l=>{const p=P(l.pid),alt=l.alt;return `<div class="line"><div class="w"><b>${esc(l.name)}</b><div class="mut">${l.free?'Free (offer)':`${qtxt(alt?l.typed:l.qty)} ${esc(uName(p,alt))} × ${inr(alt?r2(l.rate*num(p.alt.per)):l.rate)}${l.rate!==l.listRate?` <s>${inr(alt?r2(l.listRate*num(p.alt.per)):l.listRate)}</s>`:''}`}</div></div><div class="a">${l.free?'₹0':inr(l.qty*l.rate)}</div>${l.free?'':`<button type="button" class="rm" data-rm="${esc(l.pid)}" aria-label="Remove ${esc(l.name)}">Remove</button>`}</div>`}).join('')}
    ${L.notes.length?`<div class="notes"><b>Offers applied</b><br>${L.notes.map(esc).join('<br>')}</div>`:''}
    <div class="sum"><span>Total</span><span id="ctotal">${inr(L.total)}</span></div><p class="mut" style="margin:6px 0 0">Rates of today. Your distributor makes the bill.</p></div>
  <label for="note">Note for your distributor (optional)</label><textarea id="note" maxlength="300" placeholder="Deliver tomorrow morning">${esc(V.note)}</textarea>
  <div style="margin-top:14px"><button type="button" class="big" style="width:100%" data-act="place" ${V.busy?'disabled':''}>${V.busy?'Placing order…':`Place order · ${inr(L.total)}`}</button></div>`}
function itemTxt(i){return `${i.altQty>0?`${qtxt(i.altQty)} ${i.altUnit}`:qtxt(i.qty)} × ${i.name}${i.free?' (free)':''}`}
function ordersView(){const os=V.d.orders||[];if(!os.length)return '<div class="empty">No orders yet.</div>';
  return os.map(o=>{const n=STEP[o.st]||0;return `<div class="card ord"><div class="hd"><b>${esc(dshow(o.date)||'')}</b><span class="st ${esc(o.st)}">${esc(STW[o.st]||o.st)}</span><span class="a">${inr(o.total)}</span></div>
    ${n?`<div class="steps" aria-hidden="true">${[1,2,3,4].map(k=>`<i class="${k<=n?'on':''}"></i>`).join('')}</div>`:''}
    <div class="mut">${o.billNo?`Bill ${esc(o.billNo)}`:'Not billed yet'}${o.online?' · Ordered online':''}</div>
    <ul>${(o.items||[]).slice(0,8).map(i=>`<li>${esc(itemTxt(i))}</li>`).join('')}${(o.items||[]).length>8?`<li>and ${o.items.length-8} more</li>`:''}</ul></div>`}).join('')+'<p class="mut" style="text-align:center">Your last 10 orders.</p>'}
function barHtml(){const L=lines();if(!L.n||V.tab==='cart')return '';return `<div class="in"><div class="t">${inr(L.total)}<small>${L.n} item${L.n>1?'s':''} in cart</small></div><button type="button" class="big" data-tab="cart">Review order</button></div>`}
function paintBar(){const b=$('#bar'),h=V.d&&!V.err?barHtml():'';b.innerHTML=h;b.hidden=!h}
function render(){const a=$('#app');
  if(V.err){a.innerHTML=`<div class="msg"><b>${esc(V.err.title)}</b><p class="mut">${esc(V.err.text)}</p>${V.err.retry?'<button type="button" class="ghost" data-act="reload">Try again</button>':''}</div>`;paintBar();return}
  if(!V.d)return;
  document.title=`Order · ${V.d.firm.name||''}`;
  a.innerHTML=head()+(V.tab==='orders'?`<h2>My orders</h2>${ordersView()}`:V.tab==='cart'?`<h2>My cart</h2>${cartView()}`:shopView())+`<p class="foot">This link is only for ${esc(V.d.shop.name)}. Please do not share it.</p></div>`;
  paintBar()}
// after a quantity changes: only that row, the bar and the tab count change (the keyboard stays open)
function paintRow(pid){const p=P(pid),el=document.querySelector(`.prod[data-p="${CSS.escape(pid)}"]`);if(p&&el){const f=document.activeElement&&document.activeElement.dataset&&document.activeElement.dataset.q===pid;
    el.outerHTML=prodRow(p);if(f){const i=document.querySelector(`[data-q="${CSS.escape(pid)}"]`);if(i){i.focus();const l=i.value.length;try{i.setSelectionRange(l,l)}catch(e){}}}}
  const t=document.querySelector('[data-tab=cart]');if(t)t.innerHTML='My cart'+(cartN()?`<span class="n">${cartN()}</span>`:'');paintBar()}

/* ---------- actions ---------- */
async function load(){if(!TOK){V.err={title:'Link not complete',text:'Open the full link your distributor sent you on WhatsApp.'};render();return}
  try{V.d=await rpc('vs_portal_get',{p_token:TOK});V.err=null;
    // items no longer sold, or now out of stock, leave the cart
    for(const pid of Object.keys(V.cart)){const p=P(pid);if(!p||p.stock==='out'||(V.cart[pid].alt&&!p.alt))delete V.cart[pid]}saveCart()}
  catch(e){if(e.kind==='LINK')V.err={title:'This link does not work',text:e.message};else if(e.kind==='OFF')V.err={title:'Ordering is closed',text:e.message};
    else if(!V.d)V.err={title:e.net?'No internet':'Could not open',text:e.message,retry:true};else toast(e.message)}
  render()}
function setQty(pid,q){const p=P(pid);if(!p)return;q=Math.max(0,Math.min(9999,Math.round(num(q)*1000)/1000));
  if(q>0)V.cart[pid]={...(V.cart[pid]||{}),q:String(q)};else delete V.cart[pid];saveCart()}
const sig=()=>JSON.stringify(Object.keys(V.cart).sort().map(k=>[k,num(V.cart[k].q),!!V.cart[k].alt]));
async function place(){const L=lines();if(!L.n||V.busy)return;
  // the same cart sent again (no reply the first time) is saved once: it keeps its reference
  let pend=null;try{pend=JSON.parse(lsGet(SK+'-pend')||'null')}catch(e){}
  const s=sig(),ref=pend&&pend.sig===s?pend.ref:Array.from(crypto.getRandomValues(new Uint8Array(12)),b=>(b%36).toString(36)).join('')+Date.now().toString(36);
  lsSet(SK+'-pend',JSON.stringify({sig:s,ref}));
  V.busy=true;V.note=($('#note')||{}).value||V.note;render();
  try{const items=Object.entries(V.cart).filter(([,c])=>num(c.q)>0).map(([pid,c])=>({pid,qty:num(c.q),alt:!!c.alt}));
    const r=await rpc('vs_portal_order',{p_token:TOK,p_items:items,p_note:V.note.trim(),p_ref:ref});
    V.done=r;V.cart={};V.note='';saveCart();lsSet(SK+'-pend',null);V.busy=false;render();window.scrollTo(0,0);load()}
  catch(e){V.busy=false;if(e.kind==='LINK'||e.kind==='OFF'){V.err={title:e.kind==='OFF'?'Ordering is closed':'This link does not work',text:e.message}}else{toast(e.message);if(e.kind==='STOCK'||e.kind==='ITEMS')load()}render()}}

document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||!V.d&&b.dataset.act!=='reload')return;const d=b.dataset;
  if(d.tab){V.tab=d.tab;if(d.tab!=='cart')V.done=null;render();window.scrollTo(0,0);return}
  if(d.brand!==undefined){V.brand=d.brand;const pl=$('#plist');if(pl)pl.innerHTML=listHtml();document.querySelectorAll('[data-brand]').forEach(x=>x.classList.toggle('on',x.dataset.brand===V.brand));return}
  if(d.step){const p=P(d.id);if(!p)return;setQty(d.id,num((V.cart[d.id]||{}).q)+num(d.step));paintRow(d.id);return}
  if(d.u){V.cart[d.u]={...(V.cart[d.u]||{q:''}),alt:!!d.alt};saveCart();paintRow(d.u);return}
  if(d.rm){delete V.cart[d.rm];saveCart();render();return}
  if(d.act==='place'){place();return}
  if(d.act==='again'){V.done=null;V.tab='shop';render();return}
  if(d.act==='reload'){V.err=null;$('#app').innerHTML='<div class="msg"><b>Opening…</b></div>';load()}});
document.addEventListener('input',e=>{const t=e.target;
  if(t.id==='find'){V.find=t.value;const pl=$('#plist');if(pl)pl.innerHTML=listHtml();return}
  if(t.id==='note'){V.note=t.value;return}
  if(t.dataset&&t.dataset.q){const pid=t.dataset.q;if(t.value===''){V.cart[pid]={...(V.cart[pid]||{}),q:''};paintBar();return}setQty(pid,t.value);
    const el=t.closest('.prod');if(el)el.classList.toggle('has',num(t.value)>0);const tb=document.querySelector('[data-tab=cart]');if(tb)tb.innerHTML='My cart'+(cartN()?`<span class="n">${cartN()}</span>`:'');paintBar()}});
document.addEventListener('change',e=>{const t=e.target;if(t.dataset&&t.dataset.q&&!(num(t.value)>0)){delete V.cart[t.dataset.q];saveCart();paintRow(t.dataset.q)}});
window.addEventListener('hashchange',()=>location.reload());
load();
})();
