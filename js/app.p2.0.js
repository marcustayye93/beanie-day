return`
<article class="${r.join(" ")}" style="animation-delay:${Math.min(n,12)*45}ms; --card-grad:${t.grad}" data-id="${f(e.id)}">
<div class="card-hit" data-toggle="${f(e.id)}" role="button" tabindex="0" aria-expanded="${s}">
<div class="card-media" style="background:${t.grad}">
${Q}
<div class="card-media-fallback" aria-hidden="true">${t.emoji}</div>
<div class="card-media-shade"></div>
<div class="card-media-top">${l.join("")}</div>
<div class="card-media-bottom">
<span class="travel-chip">\uD83D\uDCCD ${o(e.travel?.zone||"Singapore")}</span>
<span class="expand-hint" aria-hidden="true">▾</span>
</div>
</div>
<div class="card-body">
<h3 class="card-title">${o(e.title)}</h3>
${e.venueName?`<p class="card-venue">${o(e.venueName)}</p>`:""}
<p class="card-desc">${Z}</p>
<div class="quick-facts">${g.join("")}</div>
<div class="card-details" ${s?"":"inert"}>
<div class="card-details-inner">
${u.join("")}
</div>
</div>
<div class="card-footer">
<span class="tap-hint">${s?"Tap to collapse":"Tap for details"}</span>
${X}
</div>
</div>
</div>
</article>
`}function P(e){a.cardList.innerHTML=`
<div class="empty-state">
<div class="empty-art">\uD83D\uDE35</div>
<p class="empty-title">Something went wrong</p>
<p class="empty-copy">${o(e)}</p>
</div>`,a.emptyState.hidden=!0}function R(){a.intro?.addEventListener("click",(t)=>{let s=t.target.closest("[data-enter-tab]");if(!s)return;y(s.dataset.enterTab)}),a.homeBtn?.addEventListener("click",()=>{b()});let e=(t)=>{let s=t.target.closest("[data-tab]");if(!s)return;v(s.dataset.tab)};a.tabNav.addEventListener("click",e),a.catScroll.addEventListener("click",e);let n=(t)=>{if(i.openCardId=i.openCardId===t?null:t,h(),i.openCardId)requestAnimationFrame(()=>{document.querySelector(`[data-id="${CSS.escape(i.openCardId)}"]`)?.scrollIntoView({