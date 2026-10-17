// Withdrawn after heat and Safari tab reloads on the user's M1 iPad.
// Compatibility API only: no capture graph, Worker or model download.
export function installLocalCaption(){
 const shadow=document.getElementById('nwa-classroom-host')?.shadowRoot;
 const message='本机字幕已停用：iPad 实测出现发热、识别不佳和页面重载。不会下载或运行识别模型。整课云端字幕请到“课程与字幕”。';
 window.__CE_LOCAL_CAPTION__?.stop?.();
 delete window.__CE_ASR_WORKER_SOURCE__;
 const say=()=>{const status=shadow?.getElementById('ce-local-status');if(status)status.textContent=message;};
 const button=shadow?.getElementById('ce-local-caption');
 if(button){button.disabled=true;button.textContent='本机字幕已停用';}
 const api={enabled:false,initializing:false,toggle:say,stop:say,text:()=>''};
 window.__CE_LOCAL_CAPTION__=api;say();return api;
}
