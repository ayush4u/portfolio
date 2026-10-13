// Jello – pastel jelly companion. ES module, no deps.
const SVG=`<svg viewBox="0 0 100 100" aria-label="Jello, a jelly companion" role="img"><defs>
<radialGradient id="jg" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#FFE3D6"/><stop offset=".55" stop-color="#FFC9B5"/><stop offset="1" stop-color="#D9C8F5"/></radialGradient></defs>
<g class="jello-lean"><g class="jello-body">
<ellipse cx="50" cy="96" rx="34" ry="4" fill="#BFEBD9" opacity=".7"/>
<path d="M14 92C8 70 14 30 50 24s46 40 36 68c-2 5-70 5-72 0z" fill="url(#jg)" stroke="#fff" stroke-opacity=".6" stroke-width="1.5"/>
<ellipse cx="34" cy="38" rx="9" ry="5" fill="#fff" opacity=".75" transform="rotate(-25 34 38)"/><circle cx="46" cy="32" r="2" fill="#fff" opacity=".8"/>
<g class="jello-eye"><ellipse cx="38" cy="58" rx="6" ry="7" fill="#fff"/><circle class="jello-p" cx="38" cy="59" r="3.6" fill="#4a3b5c"/></g>
<g class="jello-eye"><ellipse cx="62" cy="58" rx="6" ry="7" fill="#fff"/><circle class="jello-p" cx="62" cy="59" r="3.6" fill="#4a3b5c"/></g>
<ellipse cx="28" cy="70" rx="5" ry="3" fill="#FF9EAA" opacity=".6"/><ellipse cx="72" cy="70" rx="5" ry="3" fill="#FF9EAA" opacity=".6"/>
<path class="jello-mouth" d="M45 70q5 5 10 0" stroke="#4a3b5c" stroke-width="2" fill="none" stroke-linecap="round"/>
<ellipse class="jello-mouth-yawn" cx="50" cy="72" rx="4" ry="5" fill="#4a3b5c"/>
<g class="jello-hat"><path d="M38 28L52 0L64 26z" fill="#D9C8F5" stroke="#fff" stroke-width="1.5"/><circle cx="52" cy="1" r="4" fill="#BFEBD9"/><path d="M44 18l14-2M41 24l20-2" stroke="#FFC9B5" stroke-width="3"/></g>
</g></g></svg>`;
let st=null;
export function mount({container=document.body,chatPanel=null,reducedMotion=null,global=true,safeZone=96,sectionSelector='[data-jello-section]',giggles=['hehe!','tee-hee ✨','boing!','that tickles!']}={}){
  if(st) return st.api;
  const mm=q=>matchMedia(q), rq=mm('(prefers-reduced-motion: reduce)');let reduced=reducedMotion??rq.matches;
  const el=document.createElement('div');el.className='jello';
  el.innerHTML=SVG+'<div class="jello-bubble" aria-live="polite"></div><div class="jello-count" hidden></div>';
  container.appendChild(el);el.classList.toggle('jello-rm',reduced);const onRQ=()=>{if(reducedMotion==null)api.setReducedMotion(rq.matches,true)};rq.addEventListener?.('change',onRQ);
  const $=s=>el.querySelector(s), bub=$('.jello-bubble'), cnt=$('.jello-count'), pupils=[...el.querySelectorAll('.jello-p')], svg=$('svg');
  st={el,thinking:false,section:null};
  let chatOpen=false,mo=null,bt, mx=innerWidth/2, my=innerHeight/2, raf=0;
  const flash=(c,ms=700)=>{if(reduced)return;el.classList.remove(c);void el.offsetWidth;el.classList.add(c);setTimeout(()=>el.classList.remove(c),ms)};
  const say=(t,ms=1400)=>{if(st.thinking)return;bub.textContent=t;bub.classList.add('show');clearTimeout(bt);bt=setTimeout(()=>bub.classList.remove('show'),ms)};
  // eyes
  const look=()=>{raf=0;const r=svg.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height*.58,a=Math.atan2(my-cy,mx-cx),d=Math.min(1,Math.hypot(mx-cx,my-cy)/200)*2.4;
    pupils.forEach(p=>p.setAttribute('transform',`translate(${(Math.cos(a)*d).toFixed(2)} ${(Math.sin(a)*d).toFixed(2)})`))};
  const onMove=e=>{const t=e.touches?e.touches[0]:e;mx=t.clientX;my=t.clientY;raf||(raf=requestAnimationFrame(look))};
  addEventListener('pointermove',onMove,{passive:true});addEventListener('touchstart',onMove,{passive:true});
  // blink
  const blink=()=>{if(!reduced){el.classList.add('blink');setTimeout(()=>el.classList.remove('blink'),140)}st.bl=setTimeout(blink,2200+Math.random()*3800)};blink();
  // dark → yawn
  const dark=()=>{const t=document.documentElement.dataset.theme;return t?t==='dark':mm('(prefers-color-scheme: dark)').matches};
  st.yi=setInterval(()=>{if(dark()&&!reduced){el.classList.add('yawn');setTimeout(()=>el.classList.remove('yawn'),1600)}},7000);
  // position / scroll companion
  const place=()=>{const s=el.offsetHeight,max=innerHeight-s-safeZone-30;let y=innerHeight*.3;
    if(st.section){y=st.section.getBoundingClientRect().top+40}if(chatOpen)y=16;el.style.setProperty('--y',Math.max(16,Math.min(max,y))+'px')};
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
  const upd=()=>{cnt.hidden=!stars.length;cnt.textContent=`★ ${got}/${stars.length}`};upd();
  stars.forEach(s=>{s.setAttribute('role','button');s.tabIndex=0;const f=()=>{if(s.classList.contains('collected'))return;s.classList.add('collected');got++;upd();flash('hop',600);
    if(got===stars.length){el.classList.add('party');say('Party time! 🎉',2500);el.dispatchEvent(new CustomEvent('jello:party',{bubbles:true}))}else say('a star! ✨')};
    s.addEventListener('click',f);s.addEventListener('keydown',e=>(e.key==='Enter'||e.key===' ')&&f())});
  const panelOpen=p=>{if(!p)return false;const cs=getComputedStyle(p),r=p.getBoundingClientRect();return !p.hidden&&cs.display!=='none'&&cs.visibility!=='hidden'&&+cs.opacity>0&&r.width>0&&r.height>0};
  const setChat=v=>{chatOpen=!!v;el.classList.toggle('aside',chatOpen);place()};
  if(chatPanel){const p=typeof chatPanel==='string'?document.querySelector(chatPanel):chatPanel;if(p){mo=new MutationObserver(()=>setChat(panelOpen(p)));mo.observe(p,{attributes:true,attributeFilter:['class','style','hidden','open','aria-hidden','data-open']});setChat(panelOpen(p))}}
  place();
  const api={el,
    think(on=true){st.thinking=!!on;clearTimeout(bt);if(on){bub.innerHTML='<span class="jello-dots"><i></i><i></i><i></i></span>';bub.classList.add('show')}else bub.classList.remove('show')},
    setThinking(v){api.think(v)},
    setChatOpen:setChat,
    setReducedMotion(v,auto){reduced=!!v;if(!auto)reducedMotion=reduced;el.classList.toggle('jello-rm',reduced)},
    say, poke(){svg.dispatchEvent(new MouseEvent('click'))}, party(){el.classList.add('party')},
    get stars(){return{collected:got,total:stars.length}},
    destroy(){st.io.disconnect();mo&&mo.disconnect();rq.removeEventListener?.('change',onRQ);cancelAnimationFrame(raf);cancelAnimationFrame(sr);clearTimeout(bt);clearTimeout(st.bl);clearInterval(st.yi);removeEventListener('pointermove',onMove);removeEventListener('touchstart',onMove);removeEventListener('scroll',onScroll);removeEventListener('resize',onScroll);document.removeEventListener('pointerover',onOver);el.remove();st=null;if(window.Jello===api)delete window.Jello}};
  st.api=api;if(global)window.Jello=api;return api;
}
export const init=mount;
export const destroy=()=>st&&st.api.destroy();
export const setThinking=v=>st&&st.api.think(v);
export const setChatOpen=v=>st&&st.api.setChatOpen(v);
export const setReducedMotion=v=>st&&st.api.setReducedMotion(v);
export default {mount,init,destroy,setThinking,setChatOpen,setReducedMotion};
