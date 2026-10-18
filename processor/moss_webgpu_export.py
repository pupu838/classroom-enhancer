from pathlib import Path
import onnx,numpy as np,sys
from onnxsim import simplify
from onnx import helper as h,numpy_helper as nh
m=onnx.shape_inference.infer_shapes(onnx.load(sys.argv[1] if len(sys.argv)>1 else 'mossformergan.onnx'))
ranks={v.name:len(v.type.tensor_type.shape.dim) for v in list(m.graph.value_info)+list(m.graph.input)}
initial=list(m.graph.initializer);nodes=[];counts={}
def constant(name,value):initial.append(nh.from_array(np.array(value,dtype=np.int64),name));return name
for n in m.graph.node:
 if n.op_type!='Einsum':nodes.append(n);continue
 eq=h.get_attribute_value(n.attribute[0]).decode().replace(' ','');a,b=n.input;out=n.output[0];prefix=n.name+'_web_';counts[eq]=counts.get(eq,0)+1
 def op(kind,inputs,output,**kw):nodes.append(h.make_node(kind,inputs,[output],name=output,**kw));return output
 if eq=='...d,hd->...hd':
  expanded=op('Unsqueeze',[a,constant(prefix+'axis',[-2])],prefix+'expand');op('Mul',[expanded,b],out)
 elif eq=='...id,...jd->...ij':
  rank=ranks[b];perm=list(range(rank));perm[-2],perm[-1]=perm[-1],perm[-2];t=op('Transpose',[b],prefix+'transpose',perm=perm);op('MatMul',[a,t],out)
 elif eq=='...ij,...jd->...id':op('MatMul',[a,b],out)
 elif eq=='bgnd,bgne->bde':
  flattened=[]
  for i,x in enumerate([a,b]):
   s=op('Shape',[x],prefix+str(i)+'shape');batch=op('Gather',[s,constant(prefix+str(i)+'batchidx',[0])],prefix+str(i)+'batch',axis=0);dim=op('Gather',[s,constant(prefix+str(i)+'dimidx',[3])],prefix+str(i)+'dim',axis=0);shape=op('Concat',[batch,constant(prefix+str(i)+'infer',[-1]),dim],prefix+str(i)+'newshape',axis=0);flattened.append(op('Reshape',[x,shape],prefix+str(i)+'flat'))
  t=op('Transpose',[flattened[0]],prefix+'transpose',perm=[0,2,1]);op('MatMul',[t,flattened[1]],out)
 elif eq=='bgnd,bde->bgne':
  expanded=op('Unsqueeze',[b,constant(prefix+'axis',[1])],prefix+'expand');op('MatMul',[a,expanded],out)
 else:raise Exception(eq)
del m.graph.node[:];m.graph.node.extend(nodes);del m.graph.initializer[:];m.graph.initializer.extend(initial)
onnx.checker.check_model(m)
m,ok=simplify(m,overwrite_input_shapes={'spec':[1,2,401,201]})
assert ok
onnx.save(m,sys.argv[2] if len(sys.argv)>2 else 'moss-webgpu.onnx')
print({'replaced':counts,'nodes':len(m.graph.node)},flush=True)
