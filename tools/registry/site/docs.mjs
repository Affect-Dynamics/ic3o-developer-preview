// Local educational enhancements; no network requests.
for (const pre of document.querySelectorAll('pre')) {
    if (!pre.querySelector('code') || !navigator.clipboard) continue;
    const wrap=document.createElement('div');
    wrap.className='code-wrap';
    pre.before(wrap);
    const button=document.createElement('button');
    button.type='button';
    button.className='copy-code';
    button.textContent='Copy';
    wrap.append(button,pre);
    button.addEventListener('click',async()=>{
        try { await navigator.clipboard.writeText(pre.textContent); button.textContent='Copied'; }
        catch { button.textContent='Select and copy manually'; }
    });
}
const run=document.getElementById('execute');
if(run) run.addEventListener('click',()=>{
    const quantity=document.getElementById('quantity').valueAsNumber;
    const price=document.getElementById('price').valueAsNumber;
    const rule=document.getElementById('guarantee').value;
    const lines=[];
    if(!Number.isSafeInteger(quantity)||!Number.isSafeInteger(price)) lines.push('FAIL: expected safe integer inputs');
    else if(quantity<0) lines.push('FAIL: Require quantity >= 0');
    else if(price<0) lines.push('PASS: Require quantity >= 0','FAIL: Require price >= 0');
    else {
        const total=quantity*price;
        const expected=rule==='add'?quantity+price:total;
        lines.push('PASS: Require quantity >= 0','PASS: Require price >= 0','Capability: multiply -> '+total);
        if(!Number.isSafeInteger(total)) lines.push('FAIL: result is not a safe integer');
        else if(total!==expected) lines.push('FAIL: Guarantee (expected '+expected+')','No successful delivery');
        else lines.push('PASS: Guarantee','Delivery: total -> response: '+total);
    }
    document.getElementById('exercise-result').textContent=lines.join('\n');
});