import {chromium} from '@playwright/test'
const browser=await chromium.launch({channel:'chrome'})
try {const page=await browser.newPage({viewport:{width:390,height:844}});page.on('pageerror',e=>console.log('ERROR',e.message));page.on('response',r=>{if(r.status()>=400)console.log('HTTP',r.status(),r.url())});await page.goto('https://259ebe46d6f53c.lhr.life',{waitUntil:'networkidle'});console.log('URL',page.url());console.log((await page.locator('body').innerText()).slice(0,6000));await page.screenshot({path:'artifacts/public-browser.png',fullPage:true})}finally{await browser.close()}
