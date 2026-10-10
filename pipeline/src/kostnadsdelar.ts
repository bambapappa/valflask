import type {Harledning} from './harledningen.ts';

/** Full uppdelning i samma period som löftets kostnad; inget nytt totalbelopp. */
export interface Summadel {
  text: string;
  msek_low: number;
  msek_base: number;
  msek_high: number;
  kalla_ref: string;
  /** Samma uttryckligen belagda pengar, även när de ingår i olika löften. */
  gemensam_id?: string;
}
interface Post {
  id: string;
  cost: {type?: string; period?: string; msek_low: number; msek_base: number; msek_high: number; harledning?: Harledning | null};
}
export interface RaknadDel {id: string; ids: string[]; low: number; base: number; high: number}
const fields = ['msek_low','msek_base','msek_high'] as const;

/** Kontrollerar full uppdelning; identitet utan belopp/period är inte ett belägg. */
export function kontrolleraSummadelar(cost: Post['cost']): void {
  const parts = cost.harledning?.summadelar;
  if (!parts) return;
  if (!parts.length || cost.harledning?.belopp_okant) throw new Error('Summadelar kräver ett känt helt belopp');
  for(const part of parts) {
    if (!part.text.trim() || !part.kalla_ref.trim() || (part.gemensam_id !== undefined && !part.gemensam_id.trim()) ||
        fields.some(k=>!Number.isFinite(part[k]) || part[k]<0) || part.msek_low>part.msek_base || part.msek_base>part.msek_high)
      throw new Error('Ogiltig kostnadsdel');
  }
  for(const k of fields) if(Math.abs(parts.reduce((s,p)=>s+p[k],0)-cost[k])>1e-7)
    throw new Error(`Kostnadsdelarnas summa stämmer inte med ${k}`);
  const keys=parts.flatMap(p=>p.gemensam_id ? [p.gemensam_id] : []);
  if(new Set(keys).size!==keys.length) throw new Error('Samma gemensamma del upprepas inom ett löfte');
}

/** Anropa efter status-, grupp- och urvalsfilter. Egna priser ändras aldrig. */
export function raknadeKostnadsdelar(posts: readonly Post[], multiplier: (p: Post)=>number = p=>p.cost.period==='per_ar'?4:1): RaknadDel[] {
  const shared=new Map<string,{signature:string; del:RaknadDel}>(), out:RaknadDel[]=[];
  for(const {p,id} of posts.map((p,index)=>({p,id:p.id ?? `utan-id:${index}`})).sort((a,b)=>a.id.localeCompare(b.id))) {
    kontrolleraSummadelar(p.cost);
    const mult=multiplier(p);
    const parts=p.cost.harledning?.summadelar ?? [{msek_low:p.cost.msek_low,msek_base:p.cost.msek_base,msek_high:p.cost.msek_high}];
    for(const part of parts) {
      const key='gemensam_id' in part ? part.gemensam_id : undefined;
      if(key) {
        const signature=JSON.stringify([p.cost.type,p.cost.period,part.msek_low,part.msek_base,part.msek_high,
          p.cost.harledning?.arsprofil.status==='kand' ? [...p.cost.harledning.arsprofil.ar].sort((a,b)=>a.ar-b.ar) : 'okand']);
        const previous=shared.get(key);
        if(previous!==undefined) {
          if(previous.signature!==signature) throw new Error(`Motstridiga belopp eller period för gemensam kostnadsdel ${key}`);
          previous.del.ids.push(id);
          continue;
        }
        const del={id,ids:[id],low:part.msek_low*mult,base:part.msek_base*mult,high:part.msek_high*mult};
        shared.set(key,{signature,del});
        out.push(del);
        continue;
      }
      out.push({id,ids:[id],low:part.msek_low*mult,base:part.msek_base*mult,high:part.msek_high*mult});
    }
  }
  return out;
}
