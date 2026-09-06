if(a.weekRefresh)a.weekRefresh.textContent=e.weekEnd?`New finds · until ${U(e.weekEnd)}`:"Marcus & Chesa · Woodlands";if(a.weekNote)a.weekNote.textContent="Only things that are new or time-limited this week — not the places you already know by heart.";if(a.footerSources)a.footerSources.textContent=e.sourcesNote||"";if(a.staleBanner){let n=W(e.weekEnd);a.staleBanner.hidden=!n}}function W(e){if(!e)return!1;try{let n=new Date(e+"T23:59:59"),t=new Date,s=new Date(n.getFullYear(),n.getMonth(),n.getDate());return new Date(t.getFullYear(),t.getMonth(),t.getDate())>s}catch{return!1}}function O(){let e=i.data?.activities||[];a.statPicks.textContent=String(e.filter((n)=>n.highlight).length),a.statHh.textContent=String(e.filter((n)=>n.tabs.includes("happy-hour")).length),a.statNear.textContent=String(e.filter((n)=>n.nearHomeBonus||n.tabs.includes("near-home")).length)}function I(){let e=i.data.tabs;if(!e.some((n)=>n.id===i.activeTab))i.activeTab=e[0].id;a.tabNav.innerHTML=e.map((n)=>{let t=n.id===i.activeTab,s=c[n.id]||c["this-week"];return`
<button type="button" class="tab-btn" role="tab" aria-selected="${t}"
data-tab="${n.id}" title="${f(n.label)}">
<span class="tab-emoji" aria-hidden="true">${s.emoji}</span>
<span class="tab-label">${o(n.shortLabel)}</span>
</button>
`}).join("")}function E(){let e=i.data.tabs;a.catScroll.innerHTML=e.map((n)=>{let t=n.id===i.activeTab,s=c[n.id]||c["this-week"];return`
<button type="button" class="cat-chip" role="tab" aria-selected="${t}"
data-tab="${n.id}" style="--cat-color:${s.color}">
<span class="cat-chip-emoji">${s.emoji}</span>
<span class="cat-chip-label">${o(n.shortLabel)}</span>
</button>
`}).join(""),requestAnimationFrame(()=>{a.catScroll.querySelector('[aria-selected="true"]')?.scrollIntoView({inline:"center",block:"nearest",behavior