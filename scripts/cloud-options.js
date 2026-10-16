const $=id=>document.getElementById(id);
chrome.storage.local.get(['cloudEndpoint','cloudToken','textbooks','autoUpload','autoSync']).then(s=>{$('endpoint').value=s.cloudEndpoint||'';$('token').value=s.cloudToken||'';$('textbooks').value=JSON.stringify(s.textbooks||{},null,2);$('auto').checked=s.autoUpload===true;$('sync').checked=s.autoSync===true;});
$('save').onclick=async()=>{try{
 const url=new URL($('endpoint').value);if(url.protocol!=='https:'||url.pathname!=='/'||url.username||url.password||url.search||url.hash)throw Error('请填写HTTPS根地址');
 const token=$('token').value;if(token.length<32)throw Error('连接密钥至少32位');const books=JSON.parse($('textbooks').value);if(!books||Array.isArray(books)||typeof books!=='object'||Object.entries(books).some(([k,v])=>!k||typeof v!=='string'||!/^[A-Za-z0-9_-]{5,150}$/.test(v)))throw Error('教材对应表格式无效');
 const granted=await chrome.permissions.request({origins:[url.origin+'/*']});if(!granted)throw Error('未授予该处理服务的访问权限');
 const r=await fetch(url.origin+'/health',{headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('连接失败 HTTP '+r.status);const health=await r.json();if(!health.ready)throw Error('后台尚缺配置：'+health.missing.join('、'));
 await chrome.storage.local.set({cloudEndpoint:url.origin+'/',cloudToken:token,textbooks:books,autoUpload:$('auto').checked||$('sync').checked,autoSync:$('sync').checked});$('status').textContent='已连接。刷新学校页面后生效。';
}catch(e){$('status').textContent=e.message;}};
