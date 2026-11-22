// GRAPH-LAYOUT.JS — algoritmos puros: no DOM, no State, sin mutar argumentos.
const GraphLayout = (() => {
    const key = x => String(x);
    const finite = v => Number.isFinite(Number(v));
    const byId = nodes => new Map(nodes.map(n => [key(n.id), n]));
    const idsOf = nodes => new Set(nodes.map(n => key(n.id)));
    const pos = (nodes, positions) => nodes.map(n => ({ ...n, ...(positions[key(n.id)] || {}) }));
    const bounds = (nodes, pad = 0) => {
        if (!nodes.length) return { x: 0, y: 0, width: 0, height: 0 };
        const left = Math.min(...nodes.map(n => Number(n.x) || 0)) - pad;
        const right = Math.max(...nodes.map(n => Number(n.x) || 0)) + pad;
        const top = Math.min(...nodes.map(n => Number(n.y) || 0)) - pad;
        const bottom = Math.max(...nodes.map(n => Number(n.y) || 0)) + pad;
        return { x:left, y:top, width:right-left, height:bottom-top };
    };
    const center = nodes => nodes.length ? {
        x: nodes.reduce((a,n) => a+(Number(n.x)||0), 0)/nodes.length,
        y: nodes.reduce((a,n) => a+(Number(n.y)||0), 0)/nodes.length
    } : {x:0,y:0};
    function grid(nodes, opts={}) {
        if (!nodes.length) return {};
        const width = opts.cellWidth || 270, height = opts.cellHeight || 155;
        const columns = Math.max(1, opts.columns || Math.ceil(Math.sqrt(nodes.length)));
        const focus = opts.center || center(nodes);
        const rows = Math.ceil(nodes.length / columns);
        const positions = {};
        nodes.forEach((node, i) => {
            positions[key(node.id)] = { x: focus.x + ((i%columns)-(columns-1)/2)*width,
                y: focus.y+(Math.floor(i/columns)-(rows-1)/2)*height };
        });
        return positions;
    }
    // Componentes conexas débiles: ignoramos la orientación de las aristas.
    function components(nodes, edges) {
        const parent = new Map(nodes.map(n => [key(n.id), key(n.id)]));
        const root = id => { let r=id; while(parent.get(r)!==r) r=parent.get(r);
            while(parent.get(id)!==id) { const p=parent.get(id);parent.set(id,r);id=p; } return r; };
        for(const e of edges) {const a=key(e.source), b=key(e.target);
            if(parent.has(a)&&parent.has(b)) { const ra=root(a), rb=root(b); if(ra!==rb) parent.set(rb,ra); }}
        const groups=new Map();
        for(const n of nodes) {const r=root(key(n.id));if(!groups.has(r))groups.set(r,[]);groups.get(r).push(n);}
        return [...groups.values()];
    }
    function islands(nodes, edges, opts={}) {
        const groups=components(nodes,edges).sort((a,b)=>{
            const ca=center(a), cb=center(b);return ca.x-cb.x||ca.y-cb.y;
        });
        if(groups.length<=1)return Object.fromEntries(nodes.map(n=>[key(n.id),{x:n.x,y:n.y}]));
        if(!opts.preserveInternal) {
            const focus=opts.center||center(nodes), result={};
            let cursor=focus.x;
            for(const group of groups){
                const layout=grid(group,{center:{x:0,y:0}}), arranged=pos(group,layout), b=bounds(arranged);
                const left=cursor-b.x;for(const n of group)result[key(n.id)]={x:layout[key(n.id)].x+left,y:layout[key(n.id)].y+focus.y};
                cursor+=b.width+(opts.gap||260);
            }
            return result;
        }
        // Conserva EXACTAMENTE las posiciones relativas de cada isla.
        // Solo traslada las cajas que se solapan, empezando por la primera.
        const gap=opts.gap||110, placed=[], result={};
        for(const group of groups){
            const b=bounds(group,75), shift={x:0,y:0};
            for(let attempts=0;attempts<groups.length*3+5;attempts++){
                const trial={left:b.x+shift.x,right:b.x+b.width+shift.x,top:b.y+shift.y,bottom:b.y+b.height+shift.y};
                const hit=placed.find(p=>trial.left<p.right+gap&&trial.right+gap>p.left&&trial.top<p.bottom+gap&&trial.bottom+gap>p.top);
                if(!hit)break;
                shift.x=hit.right+gap-b.x;
            }
            placed.push({left:b.x+shift.x,right:b.x+b.width+shift.x,top:b.y+shift.y,bottom:b.y+b.height+shift.y});
            for(const n of group)result[key(n.id)]={x:(Number(n.x)||0)+shift.x,y:(Number(n.y)||0)+shift.y};
        }
        return result;
    }
    // Relaciones con interpretación de orientación lógica; las demás no fuerzan capas.
    function orientedEdge(e, criterion='dependencias') {
        const t=String(e.label||'').trim().toLowerCase().replace(/\s+/g,'_');
        const prerequisite=['requiere','depende_de','depende','necesita','usa','utiliza'];
        const forward=['prerrequisito_de','permite','implica','es_necesario_para'];
        if(criterion==='generalidad') {
            if(['generaliza','es_generalizacion_de'].includes(t))return [key(e.source),key(e.target)];
            if(['es_caso_de','caso_particular_de','particulariza'].includes(t))return [key(e.target),key(e.source)];
            return null;
        }
        if(prerequisite.includes(t))return [key(e.target),key(e.source)];
        if(forward.includes(t))return [key(e.source),key(e.target)];
        // «demuestra» puede señalar una demostración o un enunciado: se omite.
        return null;
    }
    function hierarchy(nodes,edges,opts={}) {
        if(!nodes.length)return {};
        const ids=idsOf(nodes), adj=new Map([...ids].map(id=>[id,[]]));
        for(const edge of edges) {
            const oriented=orientedEdge(edge,opts.criterion||'dependencias');
            if(oriented && ids.has(oriented[0]) && ids.has(oriented[1]) && oriented[0]!==oriented[1]) adj.get(oriented[0]).push(oriented[1]);
        }
        // Tarjan: condensación de las componentes fuertemente conexas.
        let clock=0, stack=[], ix=new Map(), low=new Map(), onStack=new Set(), groups=[];
        function visit(v) {
            ix.set(v,clock);low.set(v,clock++);stack.push(v);onStack.add(v);
            for(const w of adj.get(v)) {
                if(!ix.has(w)){visit(w);low.set(v,Math.min(low.get(v),low.get(w)));}
                else if(onStack.has(w))low.set(v,Math.min(low.get(v),ix.get(w)));
            }
            if(low.get(v)===ix.get(v)) {const group=[];let w;do {w=stack.pop();onStack.delete(w);group.push(w);}while(w!==v);groups.push(group);}
        }
        for(const v of ids)if(!ix.has(v))visit(v);
        if(groups.length===1) return Object.fromEntries(nodes.map(n=>[key(n.id),{x:n.x,y:n.y}]));
        const member=new Map();groups.forEach((g,i)=>g.forEach(id=>member.set(id,i)));
        const edgesDAG=groups.map(()=>new Set()),indegree=groups.map(()=>0),levels=groups.map(()=>0);
        for(const [from,targets] of adj)for(const to of targets){const a=member.get(from),b=member.get(to);
            if(a!==b&&!edgesDAG[a].has(b)){edgesDAG[a].add(b);indegree[b]++;}}
        const q=indegree.map((v,i)=>v===0?i:null).filter(v=>v!==null);
        for(let i=0;i<q.length;i++)for(const to of edgesDAG[q[i]]){
            levels[to]=Math.max(levels[to],levels[q[i]]+1);
            if(--indegree[to]===0)q.push(to);
        }
        const byLevel=new Map();groups.forEach((g,i)=>{const l=levels[i];if(!byLevel.has(l))byLevel.set(l,[]);byLevel.get(l).push(i);});
        // Ordenación baricéntrica (predecesores en la capa anterior).
        const preds=groups.map(()=>[]);edgesDAG.forEach((targets,i)=>targets.forEach(j=>preds[j].push(i)));
        const orderedLevels=[...byLevel.keys()].sort((a,b)=>a-b),groupX=new Map();
        for(const level of orderedLevels){const arr=byLevel.get(level);
            arr.sort((a,b)=>{
                const score=i=>preds[i].length?preds[i].reduce((s,j)=>s+(groupX.get(j)||0),0)/preds[i].length:groups[i].map(id=>[...ids].indexOf(id)).reduce((s,v)=>s+v,0)/groups[i].length;
                return score(a)-score(b);
            });arr.forEach((i,j)=>groupX.set(i,j));
        }
        const focus=opts.center||center(nodes), cellW=opts.cellWidth||270,cellH=opts.cellHeight||165;
        const maxLevel=orderedLevels[orderedLevels.length-1]||0, result={};
        for(const level of orderedLevels){
            const expanded=byLevel.get(level).flatMap(i=>groups[i]);
            expanded.forEach((id,j)=>{ result[id]={x:focus.x+(j-(expanded.length-1)/2)*cellW,
                y:focus.y+(level-maxLevel/2)*cellH}; });
        }
        return result;
    }
    // Reserva una zona al lado derecho del mapa actual, dejando una separación reconocible.
    function newBatch(existing, added, opts={}) {
        if(!added.length)return {};
        if(!existing.length)return grid(added,{center:{x:0,y:0}});
        const b=bounds(existing);
        const columns=Math.ceil(Math.sqrt(added.length));
        const width=(columns-1)*270;
        const startX=b.x+b.width+(opts.separation||540)+width/2;
        return grid(added,{center:{x:startX,y:b.y+b.height/2},columns});
    }
    return {grid,components,islands,hierarchy,newBatch,center,bounds,orientedEdge};
})();
