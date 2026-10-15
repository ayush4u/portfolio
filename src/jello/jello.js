// Jello – pastel jelly companion. ES module, no deps.
const SVG=`<svg viewBox="-4 -4 112 108" aria-label="Jello, a jelly companion" role="img">
<g class="jello-lean"><g class="jello-body">
<path class="jello-fill" d="M14 92C8 70 14 30 50 24s46 40 36 68c-2 5-70 5-72 0z"/>
<g class="jello-eye"><ellipse class="jello-p jello-ink" cx="38" cy="58" rx="4.2" ry="5.6"/></g>
<g class="jello-eye"><ellipse class="jello-p jello-ink" cx="62" cy="58" rx="4.2" ry="5.6"/></g>
<ellipse class="jello-blush" cx="27" cy="69" rx="6" ry="3.4"/><ellipse class="jello-blush" cx="73" cy="69" rx="6" ry="3.4"/>
<path class="jello-mouth" d="M45 68q5 5.5 10 0" fill="none" stroke-linecap="round"/>
<ellipse class="jello-mouth-yawn jello-ink" cx="50" cy="71" rx="4" ry="5"/>
<g class="jello-hat"><path class="jello-hatc" d="M38 28L52 2L64 26z"/><circle class="jello-hatb" cx="52" cy="2" r="4"/></g>
</g></g></svg>`;
let st=null;
// ---- badge: mini flat Jello face inside a button. Independent of mount()/destroy(). ----
const BSVG=`<svg class="jello-badge-svg" viewBox="0 0 56 56" aria-hidden="true" focusable="false">
<circle class="jello-fill" cx="28" cy="28" r="26.4"/>
<g class="jello-badge-eye"><circle class="jello-p jello-ink" cx="20" cy="25" r="3.2"/></g>
<g class="jello-badge-eye"><circle class="jello-p jello-ink" cx="36" cy="25" r="3.2"/></g>
<path class="jello-badge-sq" d="M16.5 26q3.5-4 7 0M32.5 26q3.5-4 7 0" fill="none"/>
<ellipse class="jello-blush" cx="14" cy="33" rx="4" ry="2.3"/><ellipse class="jello-blush" cx="42" cy="33" rx="4" ry="2.3"/>
<path class="jello-mouth" d="M24 34q4 4.5 8 0" fill="none" stroke-linecap="round"/></svg>`;
const B={set:new Set(),mx:0,my:0,raf:0,on:false};
const bLook=()=>{B.raf=0;B.set.forEach(b=>b.look(B.mx,B.my))};
const bMove=e=>{const t=e.touches?e.touches[0]:e;if(!t)return;B.mx=t.clientX;B.my=t.clientY;B.raf||(B.raf=requestAnimationFrame(bLook))};
const bListen=on=>{if(on===B.on)return;B.on=on;const f=on?addEventListener:removeEventListener;f('pointermove',bMove,{passive:true});f('touchstart',bMove,{passive:true});if(!on){cancelAnimationFrame(B.raf);B.raf=0}};
export function badge(el,{reducedMotion=null,label=null}={}){
  el=typeof el==='string'?document.querySelector(el):el;if(!el)return{destroy(){}};
  if(el._jelloBadge)return el._jelloBadge;
  const rq=matchMedia('(prefers-reduced-motion: reduce)');let reduced=reducedMotion??rq.matches;
  const prevLabel=el.getAttribute('aria-label');if(!prevLabel)el.setAttribute('aria-label',label||el.textContent.trim()||'Open chat');
  const wrap=document.createElement('span');wrap.className='jello-badge';wrap.innerHTML=BSVG;
  const prevPos=el.style.position;if(getComputedStyle(el).position==='static')el.style.position='relative';
  el.classList.add('jello-badged');el.appendChild(wrap);
  const svg=wrap.firstChild,pupils=[...svg.querySelectorAll('.jello-p')];
  const rest=()=>pupils.forEach(p=>p.removeAttribute('transform'));
  const look=(x,y)=>{if(reduced)return;const r=svg.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height*.45,a=Math.atan2(y-cy,x-cx),d=Math.min(1,Math.hypot(x-cx,y-cy)/160)*2;
    pupils.forEach(p=>p.setAttribute('transform',`translate(${(Math.cos(a)*d).toFixed(2)} ${(Math.sin(a)*d).toFixed(2)})`))};
  let bt=0;const blink=()=>{if(!reduced&&!wrap.classList.contains('happy')){wrap.classList.add('blink');setTimeout(()=>wrap.classList.remove('blink'),140)}bt=setTimeout(blink,2500+Math.random()*4000)};bt=setTimeout(blink,1500+Math.random()*2000);
  const hi=()=>wrap.classList.add('happy'),lo=()=>wrap.classList.remove('happy');
  el.addEventListener('pointerenter',hi);el.addEventListener('pointerleave',lo);el.addEventListener('focus',hi);el.addEventListener('blur',lo);
  const setRM=v=>{reduced=!!v;wrap.classList.toggle('jello-rm',reduced);if(reduced)rest()};setRM(reduced);
  const onRQ=()=>{if(reducedMotion==null)setRM(rq.matches)};rq.addEventListener?.('change',onRQ);
  const me={look};B.set.add(me);bListen(true);
  const api={el:wrap,setReducedMotion(v){reducedMotion=!!v;setRM(v)},destroy(){clearTimeout(bt);rq.removeEventListener?.('change',onRQ);
    el.removeEventListener('pointerenter',hi);el.removeEventListener('pointerleave',lo);el.removeEventListener('focus',hi);el.removeEventListener('blur',lo);
    B.set.delete(me);if(!B.set.size)bListen(false);wrap.remove();el.style.position=prevPos;el.classList.remove('jello-badged');if(prevLabel==null)el.removeAttribute('aria-label');delete el._jelloBadge}};
  el._jelloBadge=api;return api;
}

export function mount({container=document.body,chatPanel=null,reducedMotion=null,global=true,safeZone=96,sectionSelector='[data-jello-section]',hero=null,heroSection=null,heroSize=null,heroRange=.6,navSelector='nav',textSelector='h1,h2,h3,h4,p,li,blockquote,figcaption,.btn,.card,.metrics',giggles=['hehe!','tee-hee ✨','boing!','that tickles!']}={}){
  if(st) return st.api;
  const mm=q=>matchMedia(q), rq=mm('(prefers-reduced-motion: reduce)');let reduced=reducedMotion??rq.matches;
  const el=document.createElement('div');el.className='jello';
  el.innerHTML=SVG+'<div class="jello-bubble" aria-live="polite"></div><div class="jello-count" hidden></div>';
  container.appendChild(el);el.addEventListener('transitionend',e=>{if(e.target===el&&st)fadeCheck()});el.classList.toggle('jello-rm',reduced);const onRQ=()=>{if(reducedMotion==null)api.setReducedMotion(rq.matches,true)};rq.addEventListener?.('change',onRQ);
  const $=s=>el.querySelector(s), bub=$('.jello-bubble'), cnt=$('.jello-count'), pupils=[...el.querySelectorAll('.jello-p')], svg=$('svg');
  st={el,thinking:false,section:null};
  let chatOpen=false,mo=null,bt, mx=innerWidth/2, my=innerHeight/2, raf=0;
  const flash=(c,ms=700)=>{if(reduced)return;el.classList.remove(c);void el.offsetWidth;el.classList.add(c);setTimeout(()=>el.classList.remove(c),ms)};
  const say=(t,ms=1400)=>{if(st.thinking)return;bub.textContent=t;bub.classList.add('show');clearTimeout(bt);bt=setTimeout(()=>bub.classList.remove('show'),ms)};
  // eyes
  // direction from the actual on-screen rect (includes hero scale); offset is in SVG units so it scales with the face
  const look=()=>{raf=0;const r=svg.getBoundingClientRect();if(!r.width)return;const cx=r.left+r.width/2,cy=r.top+r.height*.55,a=Math.atan2(my-cy,mx-cx),d=Math.min(1,Math.hypot(mx-cx,my-cy)/Math.max(120,r.width*1.2))*3.6;
    pupils.forEach(p=>p.setAttribute('transform',`translate(${(Math.cos(a)*d).toFixed(2)} ${(Math.sin(a)*d).toFixed(2)})`))};
  const onMove=e=>{const t=e.touches?e.touches[0]:e;mx=t.clientX;my=t.clientY;raf||(raf=requestAnimationFrame(look))};
  addEventListener('pointermove',onMove,{passive:true});addEventListener('touchstart',onMove,{passive:true});addEventListener('touchmove',onMove,{passive:true});
  // blink
  const blink=()=>{if(!reduced){el.classList.add('blink');setTimeout(()=>el.classList.remove('blink'),140)}st.bl=setTimeout(blink,2200+Math.random()*3800)};blink();
  // dark → yawn
  const dark=()=>{const t=document.documentElement.dataset.theme;return t?t==='dark':mm('(prefers-color-scheme: dark)').matches};
  st.yi=setInterval(()=>{if(dark()&&!reduced){el.classList.add('yawn');setTimeout(()=>el.classList.remove('yawn'),1600)}},7000);
  // position / scroll companion
  const navBottom=()=>{let b=0;document.querySelectorAll(navSelector).forEach(n=>{const r=n.getBoundingClientRect(),cs=getComputedStyle(n);if(cs.display!=='none'&&r.height>0&&r.bottom>0)b=Math.max(b,r.bottom)});return b};
  const place=()=>{const s=el.offsetHeight,phone=innerWidth<=600,top=Math.max(16,phone?navBottom()+8:16),max=innerHeight-s-safeZone-(phone?8:30);let y=innerHeight*.3;
    if(st.section){y=st.section.getBoundingClientRect().top+40}if(chatOpen)y=16;y=Math.max(top,Math.min(max,y));if(max<top)y=Math.max(16,max);el.style.setProperty('--y',y+'px');heroPlace(y);fadeCheck()};
  // fade to 40% when the companion sits over text blocks (never in hero-idle, where it lives inside its own slot)
  const fadeCheck=()=>{if(chatOpen||el.classList.contains('jello-hero-idle')){el.classList.remove('jello-over-text');return}
    const j=svg.getBoundingClientRect();let hit=false;
    for(const t of document.querySelectorAll(textSelector)){if(el.contains(t))continue;const r=t.getBoundingClientRect();
      if(r.width&&r.bottom>j.top+4&&r.top<j.bottom-4&&r.right>j.left+4&&r.left<j.right-4){hit=true;break}}
    el.classList.toggle('jello-over-text',hit)};
  // hero mode: scroll-linked fly from hero slot to corner (transforms only)
  const heroEl=hero?(typeof hero==='string'?document.querySelector(hero):hero):null;
  const heroSec=heroEl?(heroSection?(typeof heroSection==='string'?document.querySelector(heroSection):heroSection):(heroEl.closest('section,header')||heroEl)):null;
  const heroOn=()=>{if(!heroEl||!heroEl.isConnected)return false;const cs=getComputedStyle(heroEl),r=heroEl.getBoundingClientRect();return cs.display!=='none'&&cs.visibility!=='hidden'&&r.width>0&&r.height>0};
  function heroPlace(y){
    const on=heroOn();el.classList.toggle('jello-hero',on);
    if(!on){el.style.transform='';el.style.removeProperty('--jello-k');el.style.opacity='';el.classList.remove('jello-hero-idle');return}
    const s=el.offsetWidth,cs=getComputedStyle(el),vw=document.documentElement.clientWidth;
    const left0=chatOpen?parseFloat(cs.left)||0:vw-(parseFloat(cs.right)||0)-s;
    const r=heroEl.getBoundingClientRect(),sr=heroSec.getBoundingClientRect();
    const H=Math.min(heroSize??(innerWidth<=600?160:280),r.width,r.height||Infinity),K=H/s;
    let p=chatOpen?1:Math.max(0,Math.min(1,-sr.top/Math.max(1,sr.height*heroRange)));
    let op='';if(reduced){op=String(Math.abs(p-.5)*2);p=p<.5?0:1}
    else p=p*p*(3-2*p);
    const hx=r.left+r.width/2-H/2,hy=r.top+r.height/2-H/2,L=(a,b)=>a+(b-a)*p;
    const k=L(K,1);el.style.transform=`translate3d(${(L(hx,left0)-left0).toFixed(1)}px,${L(hy,y).toFixed(1)}px,0) scale(${k.toFixed(3)})`;el.style.setProperty('--jello-k',k.toFixed(3));
    el.style.opacity=op;el.classList.toggle('jello-hero-idle',p<.02);
    if(!raf)raf=requestAnimationFrame(look)}
  let sr=0;const onScroll=()=>{sr||(sr=requestAnimationFrame(()=>{sr=0;place()}))};
  addEventListener('scroll',onScroll,{passive:true});addEventListener('resize',onScroll);
  const vis=new Map();
  st.io=new IntersectionObserver(es=>{es.forEach(e=>vis.set(e.target,e.intersectionRatio));
    let best=null,b=0;vis.forEach((r,t)=>{if(r>b){b=r;best=t}});
    if(best&&best!==st.section){st.section=best;flash('hop',600);place()}},{threshold:[0,.25,.5,.75,1]});
  document.querySelectorAll(sectionSelector).forEach(s=>st.io.observe(s));
  // poke
  svg.addEventListener('click',()=>{flash('wobble');say(giggles[Math.random()*giggles.length|0])});
  // curious
  const onOver=e=>{const t=e.target.closest?.('[data-jello-curious]');if(!t){el.style.setProperty('--lean','0deg');return}
    const r=t.getBoundingClientRect(),j=svg.getBoundingClientRect(),dx=(r.left+r.width/2)-(j.left+j.width/2),dy=(r.top+r.height/2)-(j.top+j.height/2);
    el.style.setProperty('--lean',(Math.max(-14,Math.min(14,dx/30))+(dy>0?0:0)).toFixed(1)+'deg');mx=r.left+r.width/2;my=r.top+r.height/2;look()};
  document.addEventListener('pointerover',onOver,{passive:true});
  // stars
  const stars=[...document.querySelectorAll('.jello-star')];let got=0;
  const upd=()=>{cnt.hidden=!stars.length||!got;cnt.textContent=`★ ${got}/${stars.length}`};upd();
  stars.forEach(s=>{s.setAttribute('role','button');s.tabIndex=0;const f=()=>{if(s.classList.contains('collected'))return;s.classList.add('collected');got++;upd();flash('hop',600);
    if(got===stars.length){el.classList.add('party');say('Party time! 🎉',2500);el.dispatchEvent(new CustomEvent('jello:party',{bubbles:true}))}else say('a star! ✨')};
    s.addEventListener('click',f);s.addEventListener('keydown',e=>(e.key==='Enter'||e.key===' ')&&f())});
  const panelOpen=p=>{if(!p)return false;const cs=getComputedStyle(p),r=p.getBoundingClientRect();return !p.hidden&&cs.display!=='none'&&cs.visibility!=='hidden'&&+cs.opacity>0&&r.width>0&&r.height>0};
  const setChat=v=>{chatOpen=!!v;el.classList.toggle('aside',chatOpen);place()};
  if(chatPanel){const p=typeof chatPanel==='string'?document.querySelector(chatPanel):chatPanel;if(p){mo=new MutationObserver(()=>setChat(panelOpen(p)));mo.observe(p,{attributes:true,attributeFilter:['class','style','hidden','open','aria-hidden','data-open']});setChat(panelOpen(p));const re=()=>st&&setChat(panelOpen(p));p.addEventListener('transitionend',re);st.rc=[setTimeout(re,100),setTimeout(re,700)];addEventListener('load',re,{once:true})}}
  place();
  const api={el,badge,
    think(on=true){st.thinking=!!on;clearTimeout(bt);if(on){bub.innerHTML='<span class="jello-dots"><i></i><i></i><i></i></span>';bub.classList.add('show')}else bub.classList.remove('show')},
    setThinking(v){api.think(v)},
    setChatOpen:setChat,
    setReducedMotion(v,auto){reduced=!!v;if(!auto)reducedMotion=reduced;el.classList.toggle('jello-rm',reduced);place()},
    say, poke(){svg.dispatchEvent(new MouseEvent('click'))}, party(){el.classList.add('party')},
    get stars(){return{collected:got,total:stars.length}},
    destroy(){st.io.disconnect();mo&&mo.disconnect();rq.removeEventListener?.('change',onRQ);cancelAnimationFrame(raf);cancelAnimationFrame(sr);clearTimeout(bt);clearTimeout(st.bl);clearInterval(st.yi);(st.rc||[]).forEach(clearTimeout);removeEventListener('pointermove',onMove);removeEventListener('touchstart',onMove);removeEventListener('touchmove',onMove);removeEventListener('scroll',onScroll);removeEventListener('resize',onScroll);el.style.transform='';document.removeEventListener('pointerover',onOver);el.remove();st=null;if(window.Jello===api)window.Jello={badge}}};
  st.api=api;if(global)window.Jello=api;return api;
}
export const init=mount;
export const destroy=()=>st&&st.api.destroy();
export const setThinking=v=>st&&st.api.think(v);
export const setChatOpen=v=>st&&st.api.setChatOpen(v);
export const setReducedMotion=v=>st&&st.api.setReducedMotion(v);
if(typeof window!=='undefined'&&!window.Jello)window.Jello={badge};
export default {badge,mount,init,destroy,setThinking,setChatOpen,setReducedMotion};
