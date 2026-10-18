// Kill switch: physical iPad testing caused renderer crashes/reloads.
// Never import the model runtime or allocate a GPU device.
self.onmessage=()=>{
 postMessage({type:'error',error:'本机 Moss 测试已因 iPad 卡退而停用，请关闭测试标签页。'});
 self.close();
};
