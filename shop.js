/* The shop's ordering page (Shop ordering link add-on). Opened from the link a distributor sends on WhatsApp:
   shop.html#t=<token>. No login: the token is the key. Everything comes from two server functions
   (supabase/vitaran_portal.sql): vs_portal_get (item names, free-goods offers, this shop's orders, final bills,
   balance and statement) and vs_portal_order (checks, prices and saves the order). The page never gets rates or
   stock: the shop picks items and quantities; the distributor's server prices the order and the bill comes later.
   A billed online order shows the final bill, worked out line by line exactly as the apps print it (gstLines() in
   www/gst.js), to print, save as PDF or share. */
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
const q2=n=>num(n).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
const qtxt=n=>(Math.round(n*1000)/1000).toLocaleString('en-IN');
const dshow=d=>d?new Date(d+'T12:00:00').toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short'}):'';
const dfull=d=>d?new Date(d+'T12:00:00').toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}):'';
const lsGet=k=>{try{return localStorage.getItem(k)}catch(e){return null}},lsSet=(k,v)=>{try{v==null?localStorage.removeItem(k):localStorage.setItem(k,v)}catch(e){}};
let _tt;function toast(m){const t=$('#toast');t.textContent=m;t.hidden=false;clearTimeout(_tt);_tt=setTimeout(()=>t.hidden=true,3800)}

async function rpc(fn,args){let r;
  try{r=await fetch(BASE+fn,{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+KEY,'Content-Type':'application/json'},body:JSON.stringify(args)})}
  catch(e){const x=new Error('No internet. Check the connection and try again.');x.net=true;throw x}
  const t=await r.text();let j=null;try{j=JSON.parse(t)}catch(e){}
  if(!r.ok){const m=String((j&&j.message)||'Something went wrong. Please try again.'),k=(m.match(/^([A-Z]+): /)||[])[1]||'';const x=new Error(m.replace(/^[A-Z]+: /,''));x.kind=k;x.net=r.status>=500||r.status===0;throw x}
  return j}

/* ---------- state ---------- */
const V={d:null,tab:'shop',find:'',brand:'',cart:{},note:'',err:null,done:null,busy:false,bill:null};
try{const c=JSON.parse(lsGet(SK+'-cart')||'{}');if(c&&typeof c==='object')V.cart=c}catch(e){}
const saveCart=()=>lsSet(SK+'-cart',Object.keys(V.cart).length?JSON.stringify(V.cart):null);
const P=id=>(V.d.products||[]).find(p=>p.id===id);
const uName=(p,alt)=>alt&&p.alt?p.alt.unit:p.base;
// a "buy X get Y free" offer for this item (first match, as the apps do)
const offerFor=p=>(V.d.offers||[]).find(s=>(s.pid&&s.pid===p.id)||(!s.pid&&s.brand&&s.brand===p.brand));
const offerText=s=>`Buy ${qtxt(num(s.min))} get ${qtxt(num(s.free))} free`;
// the cart as order lines in the base unit, and the free goods the offers add (the server works out the same)
function lines(){const out=[],free=[];
  for(const [pid,c] of Object.entries(V.cart)){const p=P(pid),q=num(c.q);if(!p||!(q>0))continue;const alt=!!(c.alt&&p.alt),qty=alt?r6(q*num(p.alt.per)):q;
    out.push({pid,p,name:p.name,brand:p.brand,typed:q,alt,qty});const s=offerFor(p);
    if(s&&num(s.min)>0&&qty>=num(s.min)){const fq=Math.floor(qty/num(s.min))*num(s.free);if(fq>0)free.push({name:p.name,qty:fq,unit:p.base})}}
  out.sort((a,b)=>(a.brand+a.name).localeCompare(b.brand+b.name));return {out,free,n:out.length}}
const cartN=()=>Object.values(V.cart).filter(c=>num(c.q)>0).length;

/* ---------- the bill, as the apps print it ---------- */
// pack size: altUnit / altPer on the product, or [24PCS] / (24pes) in the name (altOf() in www/invoice.js)
function altOf(i){if(i.altUnit&&num(i.altPer)>0)return {unit:String(i.altUnit).toUpperCase(),per:num(i.altPer)};
  const m=/[\[(]\s*(\d+)\s*(?:pcs|pes|pc|nos|pkt)\s*[\])]/i.exec(String(i.name||''));return m&&+m[1]>1?{unit:'CASE',per:+m[1]}:null}
// taxable value and GST for every line from the line amount, then rounded to the rupee (gstLines() in www/gst.js)
function billCalc(b){const lines=[];
  (b.items||[]).forEach((i,k)=>{const qty=num(i.qty);if(qty<=0)return;const g=i.gst===null||i.gst===undefined?0:num(i.gst),gross=qty*num(i.rate);
    const ass=r2(b.incl?gross/(1+g/100):gross),half=b.inter?0:r2(ass*g/200),igst=b.inter?r2(ass*g/100):0;
    lines.push({...i,sl:k+1,qty,g,ass,cgst:half,sgst:half,igst,tot:r2(ass+half*2+igst)})});
  const sum=f=>r2(lines.reduce((a,l)=>a+l[f],0)),exact=sum('tot'),total=Math.round(exact);
  return {lines,ass:sum('ass'),cgst:sum('cgst'),sgst:sum('sgst'),igst:sum('igst'),exact,total,round:r2(total-exact)}}
const billTitle=b=>{const t=String(b.vtype||'').toUpperCase();return /PERFORMA|PROFORMA/.test(t)?'Proforma Invoice':/SUPPLY/.test(t)?'Bill of Supply':'Tax Invoice'};
function billView(o){const b=o.bill,c=billCalc(b),f=b.firm||{},pt=b.party||{};
  const rows=c.lines.map(l=>{const a=altOf(l);return `<tr><td>${l.sl}</td><td><b>${esc(l.name)}</b>${l.free?` <span class="free">Free${l.scheme?' · '+esc(l.scheme):''}</span>`:''}<div class="mut">${l.hsn?'HSN '+esc(l.hsn)+' · ':''}GST ${qtxt(l.g)}%</div></td>
    <td class="n">${qtxt(l.qty)} ${esc(l.unit)}${a?`<div class="mut">${q2(l.qty/a.per)} ${esc(a.unit)}</div>`:''}</td><td class="n">${l.qty?q2(l.ass/l.qty):''}</td><td class="n">${q2(l.ass)}</td></tr>`}).join('');
  const tax=b.inter?[['IGST',c.igst]]:[['CGST',c.cgst],['SGST',c.sgst]];
  return `<div class="noprint" style="margin:12px 0"><button type="button" class="ghost" data-act="billBack">← My orders</button></div>
  <div class="card bill" id="bill"><div class="bh"><div><b class="bf">${esc(f.name)}</b><div class="mut">${esc([f.addr1,f.addr2,[f.place,f.pin].filter(Boolean).join(' ')].filter(Boolean).join(', '))}</div>
    ${f.gstin?`<div class="mut">GSTIN ${esc(f.gstin)}</div>`:''}${f.phone?`<div class="mut">Phone ${esc(f.phone)}</div>`:''}</div>
    <div class="bt"><b>${esc(billTitle(b))}</b><div>No. <b id="billno">${esc(b.no)}</b></div><div>Date <b>${esc(dfull(b.date))}</b></div></div></div>
  <div class="bto"><span class="mut">Bill to</span><br><b>${esc(pt.name)}</b>${[pt.address,pt.area,[pt.town,pt.pin].filter(Boolean).join(' ')].filter(Boolean).length?`<div class="mut">${esc([pt.address,pt.area,[pt.town,pt.pin].filter(Boolean).join(' ')].filter(Boolean).join(', '))}</div>`:''}${pt.gstin?`<div class="mut">GSTIN ${esc(pt.gstin)}</div>`:''}</div>
  <div class="tw"><table class="bt2"><thead><tr><th>#</th><th>Item</th><th class="n">Qty</th><th class="n">Rate ₹</th><th class="n">Amount ₹</th></tr></thead><tbody>${rows}</tbody></table></div>
  <div class="tot"><div><span>Taxable value</span><span>${q2(c.ass)}</span></div>${tax.map(([n,a])=>`<div><span>${n}</span><span>${q2(a)}</span></div>`).join('')}
    ${Math.abs(c.round)>=0.005?`<div><span>Round off</span><span>${c.round<0?'(−) ':''}${q2(Math.abs(c.round))}</span></div>`:''}
    <div class="gt"><span>Total</span><span id="billtotal">${inr(c.total)}</span></div>${num(b.paid)>0?`<div><span>Paid</span><span>${q2(b.paid)}</span></div>`:''}</div>
  ${b.irn?`<p class="mut">e-Invoice IRN ${esc(b.irn)}</p>`:''}${b.ewb?`<p class="mut">e-Way Bill ${esc(b.ewb)}</p>`:''}
  <p class="mut" style="margin-bottom:0">Rates are before GST. This is a copy of your bill from ${esc(f.name)}.</p></div>
  <div class="noprint btnrow"><button type="button" class="big" data-act="print">Save as PDF or print</button><button type="button" class="ghost" data-act="shareBill" data-id="${esc(o.id)}">Share</button></div>`}
function billText(o){const b=o.bill,c=billCalc(b);
  return `${b.firm.name}\n${billTitle(b)} ${b.no} · ${dfull(b.date)}\nTo: ${b.party.name}\n\n${c.lines.map(l=>`${qtxt(l.qty)} ${l.unit} ${l.name}${l.free?' (free)':''} @ ₹${q2(l.qty?l.ass/l.qty:0)} = ₹${q2(l.ass)}`).join('\n')}\n\nTaxable ₹${q2(c.ass)}${b.inter?` · IGST ₹${q2(c.igst)}`:` · CGST ₹${q2(c.cgst)} · SGST ₹${q2(c.sgst)}`}${Math.abs(c.round)>=0.005?` · Round off ₹${q2(c.round)}`:''}\nTotal ${inr(c.total)}`}

/* ---------- screens ---------- */
const STEP={booked:1,billed:2,out:3,delivered:4};
const STW={booked:'Booked',billed:'Billed',out:'Out for delivery',delivered:'Delivered',missed:'Not delivered',cancelled:'Cancelled'};
const balWord=b=>b>0.005?'Your balance due':b<-0.005?'Your advance':'Your balance';
function head(){const d=V.d,f=d.firm||{},b=num(d.balance),ph=String(f.phone||'').replace(/\D/g,'').slice(-10);
  return `<div class="top noprint"><div class="wrap">${ph.length===10?`<a class="call" href="tel:+91${ph}">Call</a>`:''}<p class="firm">${esc(f.name||'Your distributor')}</p><div class="for">Order for <b>${esc(d.shop.name)}</b>${d.shop.area?' · '+esc(d.shop.area):''}</div></div></div>
  <div class="wrap"><button type="button" class="bal noprint" data-tab="account"><div><div class="l">${balWord(b)}</div><div class="v ${b>0.005?'due':'ok'}" id="bal">${b>0.005||b<-0.005?inr(Math.abs(b)):'Nothing due'}</div></div><div class="s">as on ${esc(dshow(d.today))}<br><u>See statement</u></div></button>
  <div class="tabs noprint" role="tablist">${[['shop','Order'],['cart','My cart'],['orders','My orders'],['account','Account']].map(([k,l])=>`<button type="button" role="tab" data-tab="${k}" class="${V.tab===k?'on':''}">${l}${k==='cart'&&cartN()?`<span class="n">${cartN()}</span>`:''}</button>`).join('')}</div>`}
function prodRow(p){const c=V.cart[p.id]||{},alt=!!(c.alt&&p.alt),has=num(c.q)>0,s=offerFor(p);
  return `<div class="prod ${has?'has':''}" data-p="${esc(p.id)}"><div class="nm"><b>${esc(p.name)}</b><div class="mut">${esc([p.unit,p.alt?`also in ${p.alt.unit}`:''].filter(Boolean).join(' · '))}</div>
    ${s?`<span class="tag off">${esc(offerText(s))}</span>`:''}
    ${p.alt?`<div><span class="units" role="group" aria-label="Unit for ${esc(p.name)}"><button type="button" data-u="${esc(p.id)}" data-alt="" class="${alt?'':'on'}">${esc(p.base)}</button><button type="button" data-u="${esc(p.id)}" data-alt="1" class="${alt?'on':''}">${esc(p.alt.unit)}</button></span></div>`:''}</div>
    ${has?`<div class="qty"><button type="button" data-step="-1" data-id="${esc(p.id)}" aria-label="One less ${esc(p.name)}">−</button><input type="number" inputmode="decimal" min="0" step="any" data-q="${esc(p.id)}" value="${esc(c.q)}" aria-label="Quantity of ${esc(p.name)} in ${esc(uName(p,alt))}"><button type="button" data-step="1" data-id="${esc(p.id)}" aria-label="One more ${esc(p.name)}">+</button></div>`
      :`<button type="button" class="add" data-step="1" data-id="${esc(p.id)}" aria-label="Add ${esc(p.name)}">Add</button>`}</div>`}
function listHtml(){const f=V.find.toLowerCase().trim().split(/\s+/).filter(Boolean),ps=(V.d.products||[]).filter(p=>(!V.brand||p.brand===V.brand)&&f.every(w=>(p.name+' '+p.brand).toLowerCase().includes(w)));
  if(!ps.length)return `<div class="empty">${(V.d.products||[]).length?'No item matches. Check the spelling.':'No items to order yet. Please call your distributor.'}</div>`;
  let h='',last=null;for(const p of ps.slice(0,400)){if(p.brand!==last){h+=`<div class="brand">${esc(p.brand)}</div>`;last=p.brand}h+=prodRow(p)}
  return h+(ps.length>400?`<p class="mut" style="text-align:center">Showing 400 of ${ps.length}. Search to find more.</p>`:'')}
function shopView(){const d=V.d,brands=[...new Set((d.products||[]).map(p=>p.brand))];
  return `${(d.offers||[]).length?`<h2>Offers for you</h2><div class="offers">${d.offers.map(s=>`<div class="offer"><b>${esc(s.name)}</b><span>${esc(offerText(s))} · ${esc(s.pid?(s.pname||'this item'):'all '+s.brand)}${s.to?` · till ${esc(dshow(s.to))}`:''}</span></div>`).join('')}</div>`:''}
  <div class="find"><input type="search" id="find" placeholder="Search ${(d.products||[]).length.toLocaleString('en-IN')} items" aria-label="Search items" value="${esc(V.find)}" autocomplete="off">
  ${brands.length>1?`<div class="chips"><button type="button" data-brand="" class="${V.brand?'':'on'}">All</button>${brands.map(b=>`<button type="button" data-brand="${esc(b)}" class="${V.brand===b?'on':''}">${esc(b)}</button>`).join('')}</div>`:''}</div>
  <div id="plist">${listHtml()}</div>`}
function cartView(){const L=lines();
  if(V.done)return `<div class="card done"><div class="ok">✓</div><b style="font-size:20px">Order placed</b><p>Your order of <b>${V.done.n} item${V.done.n===1?'':'s'}</b> has reached ${esc(V.d.firm.name)}.${V.done.again?' (It was already placed.)':''}</p>${(V.done.free||[]).length?`<p class="mut">Free with offers: ${V.done.free.map(x=>`${qtxt(num(x.qty))} × ${esc(x.name)}`).join(', ')}</p>`:''}<p class="mut">See it in My orders. Your distributor makes the bill; you see it here once it is ready.</p><button type="button" class="ghost" data-tab="orders">See my orders</button> <button type="button" class="ghost" data-act="again">Order more</button></div>`;
  if(!L.n)return `<div class="empty"><b>Your cart is empty.</b><br>Tap Add on the items you need.</div><div style="text-align:center"><button type="button" class="ghost" data-tab="shop">Choose items</button></div>`;
  return `<div class="card">${L.out.map(l=>`<div class="line"><div class="w"><b>${esc(l.name)}</b><div class="mut">${esc(l.brand)}</div></div><div class="a">${qtxt(l.typed)} ${esc(uName(l.p,l.alt))}</div><button type="button" class="rm" data-rm="${esc(l.pid)}" aria-label="Remove ${esc(l.name)}">Remove</button></div>`).join('')}
    ${L.free.length?`<div class="notes"><b>Free with offers</b><br>${L.free.map(f=>`${esc(f.name)}: ${qtxt(f.qty)} ${esc(f.unit)} free`).join('<br>')}</div>`:''}
    <p class="mut" style="margin:10px 0 0">${L.n} item${L.n>1?'s':''}. Your distributor prices the order with your rates and makes the bill.</p></div>
  <label for="note">Note for your distributor (optional)</label><textarea id="note" maxlength="300" placeholder="Deliver tomorrow morning">${esc(V.note)}</textarea>
  <div style="margin-top:14px"><button type="button" class="big" style="width:100%" data-act="place" ${V.busy?'disabled':''}>${V.busy?'Placing order…':`Place order · ${L.n} item${L.n>1?'s':''}`}</button></div>`}
function itemTxt(i){return `${i.altQty>0?`${qtxt(i.altQty)} ${i.altUnit}`:qtxt(i.qty)} × ${i.name}${i.free?' (free)':''}`}
function ordersView(){const os=V.d.orders||[];if(!os.length)return '<div class="empty">No orders yet.</div>';
  return os.map(o=>{const n=STEP[o.st]||0;return `<div class="card ord" data-o="${esc(o.id)}"><div class="hd"><b>${esc(dshow(o.date)||'')}</b><span class="st ${esc(o.st)}">${esc(STW[o.st]||o.st)}</span>${o.total!=null?`<span class="a">${inr(o.total)}</span>`:''}</div>
    ${n?`<div class="steps" aria-hidden="true">${[1,2,3,4].map(k=>`<i class="${k<=n?'on':''}"></i>`).join('')}</div>`:''}
    <div class="mut">${o.billNo?`Bill ${esc(o.billNo)}`:'Not billed yet'}${o.online?' · Ordered online':''}</div>
    <ul>${(o.items||[]).slice(0,8).map(i=>`<li>${esc(itemTxt(i))}</li>`).join('')}${(o.items||[]).length>8?`<li>and ${o.items.length-8} more</li>`:''}</ul>
    ${o.bill?`<button type="button" class="ghost small" data-bill="${esc(o.id)}">See bill ${esc(o.billNo)}</button>`:''}</div>`}).join('')+'<p class="mut" style="text-align:center">Your last 10 orders.</p>'}
const balTxt=b=>Math.abs(b)<0.005?'0':`${Math.abs(r2(b)).toLocaleString('en-IN',{maximumFractionDigits:2})} ${b>0?'Dr':'Cr'}`;
const dsh=d=>d?new Date(d+'T12:00:00').toLocaleDateString('en-IN',{day:'numeric',month:'short'}):'';
function accountView(){const L=V.d.ledger||{rows:[]},b=num(V.d.balance);
  return `<div class="card"><div class="mut">${balWord(b)} as on ${esc(dfull(V.d.today))}</div><div class="bigv ${b>0.005?'due':'ok'}" id="outst">${b>0.005||b<-0.005?inr(Math.abs(b)):'Nothing due'}</div><p class="mut" style="margin:6px 0 0">Bills, payments and returns in your account with ${esc(V.d.firm.name)}. Orders count once they are billed.</p></div>
  <h2>Statement · ${esc(dfull(L.from))} to ${esc(dfull(L.to))}</h2>
  <div class="card tw"><table class="led" id="ledger"><thead><tr><th>Date</th><th>Particulars</th><th class="n">Debit</th><th class="n">Credit</th><th class="n">Balance</th></tr></thead><tbody>
  <tr class="b"><td></td><td>Closing balance</td><td></td><td></td><td class="n">${balTxt(num(L.close))}</td></tr>
  ${(L.rows||[]).map(r=>`<tr><td style="white-space:nowrap">${esc(dsh(r.d))}</td><td>${esc(r.part)}${r.no?` <span class="mut">${esc(r.no)}</span>`:''}</td><td class="n">${num(r.dr)?q2(r.dr):''}</td><td class="n">${num(r.cr)?q2(r.cr):''}</td><td class="n">${balTxt(num(r.bal))}</td></tr>`).join('')}
  <tr class="b"><td></td><td>Opening balance on ${esc(dfull(L.from))}</td><td></td><td></td><td class="n">${balTxt(num(L.open))}</td></tr></tbody></table>
  ${(L.rows||[]).length?'':'<p class="mut">No bills or payments in these days.</p>'}</div>
  <p class="mut">Newest first. Debit: bills (you owe). Credit: payments and returns. Dr = you owe, Cr = advance.</p>
  <div class="noprint btnrow"><button type="button" class="big" data-act="print">Save as PDF or print</button></div>`}
function barHtml(){const n=cartN();if(!n||V.tab==='cart'||V.bill)return '';return `<div class="in"><div class="t">${n} item${n>1?'s':''}<small>in your cart</small></div><button type="button" class="big" data-tab="cart">Review order</button></div>`}
function paintBar(){const b=$('#bar'),h=V.d&&!V.err?barHtml():'';b.innerHTML=h;b.hidden=!h}
function render(){const a=$('#app');
  if(V.err){a.innerHTML=`<div class="msg"><b>${esc(V.err.title)}</b><p class="mut">${esc(V.err.text)}</p>${V.err.retry?'<button type="button" class="ghost" data-act="reload">Try again</button>':''}</div>`;paintBar();return}
  if(!V.d)return;
  document.title=`Order · ${V.d.firm.name||''}`;
  const bo=V.bill&&(V.d.orders||[]).find(o=>o.id===V.bill&&o.bill);if(V.bill&&!bo)V.bill=null;
  a.innerHTML=head()+(bo?billView(bo):V.tab==='orders'?`<h2>My orders</h2>${ordersView()}`:V.tab==='account'?accountView():V.tab==='cart'?`<h2>My cart</h2>${cartView()}`:shopView())+`<p class="foot noprint">This link is only for ${esc(V.d.shop.name)}. Please do not share it.</p></div>`;
  paintBar()}
// after a quantity changes: only that row, the bar and the tab count change (the keyboard stays open)
function paintRow(pid){const p=P(pid),el=document.querySelector(`.prod[data-p="${CSS.escape(pid)}"]`);if(p&&el){const f=document.activeElement&&document.activeElement.dataset&&document.activeElement.dataset.q===pid;
    el.outerHTML=prodRow(p);if(f){const i=document.querySelector(`[data-q="${CSS.escape(pid)}"]`);if(i){i.focus();const l=i.value.length;try{i.setSelectionRange(l,l)}catch(e){}}}}
  paintTab();paintBar()}
function paintTab(){const t=document.querySelector('[data-tab=cart][role=tab]');if(t)t.innerHTML='My cart'+(cartN()?`<span class="n">${cartN()}</span>`:'')}

/* ---------- actions ---------- */
async function load(){if(!TOK){V.err={title:'Link not complete',text:'Open the full link your distributor sent you on WhatsApp.'};render();return}
  try{V.d=await rpc('vs_portal_get',{p_token:TOK});V.err=null;
    // items no longer sold leave the cart
    for(const pid of Object.keys(V.cart)){const p=P(pid);if(!p||(V.cart[pid].alt&&!p.alt))delete V.cart[pid]}saveCart()}
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
  catch(e){V.busy=false;if(e.kind==='LINK'||e.kind==='OFF'){V.err={title:e.kind==='OFF'?'Ordering is closed':'This link does not work',text:e.message}}else{toast(e.message);if(e.kind==='ITEMS')load()}render()}}
async function shareBill(id){const o=(V.d.orders||[]).find(x=>x.id===id);if(!o||!o.bill)return;const t=billText(o);
  try{if(navigator.share){await navigator.share({title:`Bill ${o.bill.no}`,text:t});return}}catch(e){if(e&&e.name==='AbortError')return}
  try{await navigator.clipboard.writeText(t);toast('Bill copied. Paste it in WhatsApp.')}catch(e){window.open('https://wa.me/?text='+encodeURIComponent(t),'_blank')}}

document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||!V.d&&b.dataset.act!=='reload')return;const d=b.dataset;
  if(d.tab){V.tab=d.tab;V.bill=null;if(d.tab!=='cart')V.done=null;render();window.scrollTo(0,0);return}
  if(d.bill){V.bill=d.bill;render();window.scrollTo(0,0);return}
  if(d.brand!==undefined){V.brand=d.brand;const pl=$('#plist');if(pl)pl.innerHTML=listHtml();document.querySelectorAll('[data-brand]').forEach(x=>x.classList.toggle('on',x.dataset.brand===V.brand));return}
  if(d.step){const p=P(d.id);if(!p)return;setQty(d.id,num((V.cart[d.id]||{}).q)+num(d.step));paintRow(d.id);return}
  if(d.u){V.cart[d.u]={...(V.cart[d.u]||{q:''}),alt:!!d.alt};saveCart();paintRow(d.u);return}
  if(d.rm){delete V.cart[d.rm];saveCart();render();return}
  if(d.act==='place'){place();return}
  if(d.act==='again'){V.done=null;V.tab='shop';render();return}
  if(d.act==='billBack'){V.bill=null;V.tab='orders';render();window.scrollTo(0,0);return}
  if(d.act==='print'){window.print();return}
  if(d.act==='shareBill'){shareBill(d.id);return}
  if(d.act==='reload'){V.err=null;$('#app').innerHTML='<div class="msg"><b>Opening…</b></div>';load()}});
document.addEventListener('input',e=>{const t=e.target;
  if(t.id==='find'){V.find=t.value;const pl=$('#plist');if(pl)pl.innerHTML=listHtml();return}
  if(t.id==='note'){V.note=t.value;return}
  if(t.dataset&&t.dataset.q){const pid=t.dataset.q;if(t.value===''){V.cart[pid]={...(V.cart[pid]||{}),q:''};paintBar();return}setQty(pid,t.value);
    const el=t.closest('.prod');if(el)el.classList.toggle('has',num(t.value)>0);paintTab();paintBar()}});
document.addEventListener('change',e=>{const t=e.target;if(t.dataset&&t.dataset.q&&!(num(t.value)>0)){delete V.cart[t.dataset.q];saveCart();paintRow(t.dataset.q)}});
window.addEventListener('hashchange',()=>location.reload());
load();
})();
