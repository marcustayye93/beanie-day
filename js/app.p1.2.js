(e.highlight)l.push('<span class="badge top">⭐ Top</span>');if(e.nearHomeBonus)l.push('<span class="badge near">\uD83C\uDFE1 Near</span>');(e.tags||[]).slice(0,2).forEach((p)=>{let ee=p==="AC"?"❄️":p==="Outdoor"?"\uD83C\uDF24️":p==="Indoor"?"\uD83C\uDFE0":"•";l.push(`<span class="badge tag">${ee} ${o(p)}</span>`)});let g=[];if(e.days?.length)g.push(`<span class="fact"><span class="fact-icon">\uD83D\uDCC5</span>${o(e.days.slice(0,3).join(" · "))}${e.days.length>3?"…":""}</span>`);if(e.tags?.includes("AC"))g.push('<span class="fact"><span class="fact-icon">❄️</span>AC</span>');if(e.travel?.fromWoodlands)g.push(`<span class="fact"><span class="fact-icon">\uD83D\uDE97</span>${o(e.travel.fromWoodlands)}</span>`);let u=[];if(e.why)u.push(`
<div class="detail-block detail-why">
<div class="label">\uD83D\uDC9A Why this week</div>
${o(e.why)}
</div>`);if(e.deal)u.push(`
<div class="detail-block detail-deal">
<div class="label">\uD83C\uDF7A The deal</div>
${o(e.deal)}
</div>`);if(e.heatNote)u.push(`
<div class="detail-block detail-heat">
<div class="label">☀️ Heat note</div>
${o(e.heatNote)}
</div>`);if(e.when)u.push(`
<div class="detail-block detail-when">
<div class="label">\uD83D\uDD50 When</div>
${o(e.when)}
</div>`);if(e.parking)u.push(`
<div class="detail-block detail-park">
<div class="label">\uD83C\uDD7F️ Parking</div>
${o(e.parking)}
</div>`);if(e.travel?.region)u.push(`
<div class="detail-block detail-when">
<div class="label">\uD83D\uDCCD Area</div>
${o(e.travel.region)} · ${o(e.travel.zone||"")}
</div>`);let Q=t.image?`<img src="${f(t.image)}" alt="" loading="lazy" decoding="async"
onload="this.parentElement.classList.add('has-img')"
onerror="this.remove()" />`:"",X=e.source?`<a class="source-link" href="${f(e.source.url)}" target="_blank" rel="noopener noreferrer">
O