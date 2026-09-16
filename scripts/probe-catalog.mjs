import {writeFileSync} from 'node:fs'
const response=await fetch('https://www.cifraclub.com.br/isaias-saad/bondade-de-deus/',{signal:AbortSignal.timeout(25000)})
const html=await response.text();writeFileSync('artifacts/catalog-probe.html',html)
console.log(JSON.stringify({status:response.status,title:html.match(/<title>(.*?)<\/title>/s)?.[1],preBlocks:(html.match(/<pre/g)||[]).length,chords:(html.match(/<b>[^<]{1,20}<\/b>/g)||[]).slice(0,12),bytes:html.length}))
